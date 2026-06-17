-- ============================================================
-- MIGRACIÓN: COTIZACIONES Y FLUJO DESACOPLADO DE APROBACIÓN
-- Electroingeniería S.A.S. — Sistema de Requisiciones
-- ============================================================
-- Esta migración:
--   1) Crea la tabla `cotizaciones` para registrar propuestas
--      de proveedores asociadas a cada requisición.
--   2) Crea el bucket de Storage para los PDF de cotizaciones.
--   3) Agrega la columna `aprobacion_pendiente` a `requisiciones`
--      para que Compras pueda mover a "En cotización" SIN que
--      el jefe haya aprobado todavía (flujo paralelo).
--
-- IDEMPOTENTE: se puede ejecutar varias veces sin romper nada.
-- ============================================================

-- ------------------------------------------------------------
-- PARTE 1: NUEVA COLUMNA EN REQUISICIONES
-- ------------------------------------------------------------
-- `aprobacion_pendiente` = TRUE significa que el jefe aún no
-- ha aprobado. Independiente del estado del flujo de compras.
-- ------------------------------------------------------------

ALTER TABLE requisiciones
    ADD COLUMN IF NOT EXISTS aprobacion_pendiente BOOLEAN NOT NULL DEFAULT true;

-- Backfill: para datos existentes, marcar como NO pendiente
-- todo lo que NO esté en "Pendiente aprobación" (ya fueron procesadas)
UPDATE requisiciones
SET aprobacion_pendiente = false
WHERE estado <> 'Pendiente aprobación'
  AND estado <> 'Rechazada'
  AND aprobacion_pendiente = true;

COMMENT ON COLUMN requisiciones.aprobacion_pendiente IS
'TRUE = falta aprobación del jefe. Permite a Compras avanzar a "En cotización" sin esperar aprobación, pero bloquea estados posteriores hasta que se apruebe.';


-- ------------------------------------------------------------
-- PARTE 2: TABLA DE COTIZACIONES
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS cotizaciones (
    id BIGSERIAL PRIMARY KEY,
    requisicion_id BIGINT NOT NULL REFERENCES requisiciones(id) ON DELETE CASCADE,

    -- Datos de la cotización
    proveedor TEXT NOT NULL,
    valor NUMERIC(15, 2) NOT NULL CHECK (valor >= 0),
    tiempo_entrega TEXT DEFAULT '',
    observaciones TEXT DEFAULT '',

    -- Archivo opcional (PDF/imagen de la cotización del proveedor)
    archivo_url TEXT,
    archivo_nombre TEXT,

    -- Marca de cotización ganadora (una por requisición)
    seleccionada BOOLEAN NOT NULL DEFAULT false,

    -- Auditoría
    creado_por UUID NOT NULL REFERENCES auth.users(id),
    creado_por_nombre TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE cotizaciones IS 'Propuestas de proveedores cargadas por Compras para cada requisición.';
COMMENT ON COLUMN cotizaciones.seleccionada IS 'TRUE = cotización elegida como ganadora. Solo una por requisición.';

CREATE INDEX IF NOT EXISTS idx_cotizaciones_requisicion ON cotizaciones(requisicion_id);
CREATE INDEX IF NOT EXISTS idx_cotizaciones_seleccionada ON cotizaciones(seleccionada) WHERE seleccionada = true;


-- ------------------------------------------------------------
-- PARTE 3: TRIGGERS DE COTIZACIONES
-- ------------------------------------------------------------

-- 3.1 Actualizar updated_at en cada modificación
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


-- 3.2 Garantizar UNA SOLA cotización seleccionada por requisición
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


-- ------------------------------------------------------------
-- PARTE 4: ROW LEVEL SECURITY EN COTIZACIONES
-- ------------------------------------------------------------

ALTER TABLE cotizaciones ENABLE ROW LEVEL SECURITY;

-- Limpiar políticas previas para hacer la migración re-ejecutable
DROP POLICY IF EXISTS "Usuarios ven cotizaciones de sus requisiciones" ON cotizaciones;
DROP POLICY IF EXISTS "Admins ven todas las cotizaciones" ON cotizaciones;
DROP POLICY IF EXISTS "Admin compras crea cotizaciones" ON cotizaciones;
DROP POLICY IF EXISTS "Admin compras edita cotizaciones" ON cotizaciones;
DROP POLICY IF EXISTS "Admin compras elimina cotizaciones" ON cotizaciones;

-- SELECT: el solicitante ve cotizaciones de SUS requisiciones
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

-- SELECT: administradores y compras ven todo
CREATE POLICY "Admins ven todas las cotizaciones"
    ON cotizaciones FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM perfiles
            WHERE id = auth.uid()
              AND rol IN ('administrador', 'super_admin', 'admin_compras')
        )
    );

-- INSERT: solo admin_compras, administrador o super_admin pueden crear
CREATE POLICY "Admin compras crea cotizaciones"
    ON cotizaciones FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM perfiles
            WHERE id = auth.uid()
              AND rol IN ('administrador', 'super_admin', 'admin_compras')
        )
    );

-- UPDATE: misma regla
CREATE POLICY "Admin compras edita cotizaciones"
    ON cotizaciones FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM perfiles
            WHERE id = auth.uid()
              AND rol IN ('administrador', 'super_admin', 'admin_compras')
        )
    );

-- DELETE: misma regla
CREATE POLICY "Admin compras elimina cotizaciones"
    ON cotizaciones FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM perfiles
            WHERE id = auth.uid()
              AND rol IN ('administrador', 'super_admin', 'admin_compras')
        )
    );


-- ------------------------------------------------------------
-- PARTE 5: BUCKET DE STORAGE PARA ARCHIVOS DE COTIZACIONES
-- ------------------------------------------------------------
-- IMPORTANTE: si tu plan free de Supabase ya tiene buckets,
-- esta inserción no rompe nada (ON CONFLICT DO NOTHING).

INSERT INTO storage.buckets (id, name, public)
VALUES ('cotizaciones-archivos', 'cotizaciones-archivos', false)
ON CONFLICT (id) DO NOTHING;

-- Políticas de Storage para el bucket
DROP POLICY IF EXISTS "Compras sube archivos cotizaciones" ON storage.objects;
DROP POLICY IF EXISTS "Usuarios leen archivos cotizaciones" ON storage.objects;
DROP POLICY IF EXISTS "Compras elimina archivos cotizaciones" ON storage.objects;

-- Solo Compras puede subir al bucket
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

-- Cualquier usuario autenticado puede leer (las URLs son firmadas, se controla en app)
CREATE POLICY "Usuarios leen archivos cotizaciones"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'cotizaciones-archivos' AND auth.uid() IS NOT NULL);

-- Compras puede eliminar archivos
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


-- ------------------------------------------------------------
-- VERIFICACIÓN FINAL
-- ------------------------------------------------------------
SELECT
    'Migración aplicada' AS estado,
    (SELECT COUNT(*) FROM information_schema.columns
        WHERE table_name = 'requisiciones'
          AND column_name = 'aprobacion_pendiente') AS columna_aprobacion,
    (SELECT COUNT(*) FROM information_schema.tables
        WHERE table_name = 'cotizaciones') AS tabla_cotizaciones,
    (SELECT COUNT(*) FROM storage.buckets
        WHERE id = 'cotizaciones-archivos') AS bucket_cotizaciones;
