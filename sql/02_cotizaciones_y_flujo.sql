
ALTER TABLE requisiciones
    ADD COLUMN IF NOT EXISTS aprobacion_pendiente BOOLEAN NOT NULL DEFAULT true;

UPDATE requisiciones
SET aprobacion_pendiente = false
WHERE estado <> 'Pendiente aprobación'
  AND estado <> 'Rechazada'
  AND aprobacion_pendiente = true;

COMMENT ON COLUMN requisiciones.aprobacion_pendiente IS
'TRUE = falta aprobación del jefe. Permite a Compras avanzar a "En cotización" sin esperar aprobación, pero bloquea estados posteriores hasta que se apruebe.';


CREATE TABLE IF NOT EXISTS cotizaciones (
    id BIGSERIAL PRIMARY KEY,
    requisicion_id BIGINT NOT NULL REFERENCES requisiciones(id) ON DELETE CASCADE,

    proveedor TEXT NOT NULL,
    valor NUMERIC(15, 2) NOT NULL CHECK (valor >= 0),
    tiempo_entrega TEXT DEFAULT '',
    observaciones TEXT DEFAULT '',

    archivo_url TEXT,
    archivo_nombre TEXT,

    seleccionada BOOLEAN NOT NULL DEFAULT false,

    creado_por UUID NOT NULL REFERENCES auth.users(id),
    creado_por_nombre TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE cotizaciones IS 'Propuestas de proveedores cargadas por Compras para cada requisición.';
COMMENT ON COLUMN cotizaciones.seleccionada IS 'TRUE = cotización elegida como ganadora. Solo una por requisición.';

CREATE INDEX IF NOT EXISTS idx_cotizaciones_requisicion ON cotizaciones(requisicion_id);
CREATE INDEX IF NOT EXISTS idx_cotizaciones_seleccionada ON cotizaciones(seleccionada) WHERE seleccionada = true;



CREATE OR REPLACE FUNCTION actualizar_updated_at_cotizaciones()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_updated_at_cotizaciones ON cotizaciones;
CREATE TRIGGER trigger_updated_at_cotizaciones
    BEFORE UPDATE ON cotizaciones
    FOR EACH ROW
    EXECUTE FUNCTION actualizar_updated_at_cotizaciones();


CREATE OR REPLACE FUNCTION exclusividad_cotizacion_seleccionada()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.seleccionada = true THEN
        UPDATE cotizaciones
        SET seleccionada = false
        WHERE requisicion_id = NEW.requisicion_id
          AND id <> NEW.id
          AND seleccionada = true;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_exclusividad_seleccionada ON cotizaciones;
CREATE TRIGGER trigger_exclusividad_seleccionada
    AFTER INSERT OR UPDATE OF seleccionada ON cotizaciones
    FOR EACH ROW
    WHEN (NEW.seleccionada = true)
    EXECUTE FUNCTION exclusividad_cotizacion_seleccionada();


ALTER TABLE cotizaciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuarios ven cotizaciones de sus requisiciones" ON cotizaciones;
DROP POLICY IF EXISTS "Admins ven todas las cotizaciones" ON cotizaciones;
DROP POLICY IF EXISTS "Admin compras crea cotizaciones" ON cotizaciones;
DROP POLICY IF EXISTS "Admin compras edita cotizaciones" ON cotizaciones;
DROP POLICY IF EXISTS "Admin compras elimina cotizaciones" ON cotizaciones;

CREATE POLICY "Usuarios ven cotizaciones de sus requisiciones"
    ON cotizaciones FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM requisiciones
            WHERE requisiciones.id = cotizaciones.requisicion_id
              AND (
                  requisiciones.user_id = auth.uid()
                  OR requisiciones.jefe_proceso_id = auth.uid()
              )
        )
    );

CREATE POLICY "Admins ven todas las cotizaciones"
    ON cotizaciones FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM perfiles
            WHERE id = auth.uid()
              AND rol IN ('administrador', 'super_admin', 'admin_compras')
        )
    );

CREATE POLICY "Admin compras crea cotizaciones"
    ON cotizaciones FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM perfiles
            WHERE id = auth.uid()
              AND rol IN ('administrador', 'super_admin', 'admin_compras')
        )
    );

CREATE POLICY "Admin compras edita cotizaciones"
    ON cotizaciones FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM perfiles
            WHERE id = auth.uid()
              AND rol IN ('administrador', 'super_admin', 'admin_compras')
        )
    );

CREATE POLICY "Admin compras elimina cotizaciones"
    ON cotizaciones FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM perfiles
            WHERE id = auth.uid()
              AND rol IN ('administrador', 'super_admin', 'admin_compras')
        )
    );




INSERT INTO storage.buckets (id, name, public)
VALUES ('cotizaciones-archivos', 'cotizaciones-archivos', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Compras sube archivos cotizaciones" ON storage.objects;
DROP POLICY IF EXISTS "Usuarios leen archivos cotizaciones" ON storage.objects;
DROP POLICY IF EXISTS "Compras elimina archivos cotizaciones" ON storage.objects;

CREATE POLICY "Compras sube archivos cotizaciones"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'cotizaciones-archivos'
        AND EXISTS (
            SELECT 1 FROM perfiles
            WHERE id = auth.uid()
              AND rol IN ('administrador', 'super_admin', 'admin_compras')
        )
    );

CREATE POLICY "Usuarios leen archivos cotizaciones"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'cotizaciones-archivos' AND auth.uid() IS NOT NULL);

CREATE POLICY "Compras elimina archivos cotizaciones"
    ON storage.objects FOR DELETE
    USING (
        bucket_id = 'cotizaciones-archivos'
        AND EXISTS (
            SELECT 1 FROM perfiles
            WHERE id = auth.uid()
              AND rol IN ('administrador', 'super_admin', 'admin_compras')
        )
    );

-
SELECT
    'Migración aplicada' AS estado,
    (SELECT COUNT(*) FROM information_schema.columns
        WHERE table_name = 'requisiciones'
          AND column_name = 'aprobacion_pendiente') AS columna_aprobacion,
    (SELECT COUNT(*) FROM information_schema.tables
        WHERE table_name = 'cotizaciones') AS tabla_cotizaciones,
    (SELECT COUNT(*) FROM storage.buckets
        WHERE id = 'cotizaciones-archivos') AS bucket_cotizaciones;
