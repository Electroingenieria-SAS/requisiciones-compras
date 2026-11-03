

CREATE TABLE IF NOT EXISTS perfiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    nombre_completo TEXT NOT NULL,
    proceso TEXT NOT NULL,
    rol TEXT NOT NULL DEFAULT 'usuario' CHECK (rol IN ('administrador', 'usuario')),
    activo BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE perfiles IS 'Perfiles de usuarios del sistema de requisiciones';
COMMENT ON COLUMN perfiles.proceso IS 'Área/proceso al que pertenece el usuario';
COMMENT ON COLUMN perfiles.rol IS 'Rol del usuario: administrador o usuario';


CREATE SEQUENCE IF NOT EXISTS requisiciones_consecutivo_seq
    START WITH 1
    INCREMENT BY 1
    MINVALUE 1
    MAXVALUE 99999
    NO CYCLE;


CREATE TABLE IF NOT EXISTS requisiciones (
    id BIGINT PRIMARY KEY DEFAULT nextval('requisiciones_consecutivo_seq'),
    id_requisicion TEXT UNIQUE NOT NULL,

    fecha TIMESTAMPTZ NOT NULL DEFAULT now(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    solicitante TEXT NOT NULL,
    proceso TEXT NOT NULL,

    unidad_negocio TEXT NOT NULL,
    centro_costo TEXT NOT NULL,
    lugar_entrega TEXT NOT NULL,
    objeto_compra TEXT NOT NULL,

    marca_sugerida TEXT DEFAULT '',
    proveedor_sugerido TEXT DEFAULT '',
    cantidad INTEGER NOT NULL CHECK (cantidad > 0),
    color TEXT DEFAULT '',
    dimensiones TEXT DEFAULT '',
    rango_precios TEXT DEFAULT '',
    url_referencia TEXT DEFAULT '',
    observaciones TEXT DEFAULT '',

    quien_ejecuta TEXT NOT NULL CHECK (quien_ejecuta IN ('Compras', 'Proceso Autónomo')),

    estado TEXT NOT NULL DEFAULT 'Pendiente' CHECK (estado IN ('Pendiente', 'En proceso', 'Cumplido')),

    fecha_entrega DATE,
    numero_factura TEXT,
    fecha_factura DATE,
    valor_real_compra NUMERIC(15, 2),

    validacion_presupuestal TEXT DEFAULT 'Pendiente',
    enviada_contabilidad TEXT DEFAULT 'No',

    eliminado BOOLEAN NOT NULL DEFAULT false,
    motivo_eliminacion TEXT,
    eliminado_por TEXT,
    fecha_eliminacion TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE requisiciones IS 'Requisiciones de compras administrativas';
COMMENT ON COLUMN requisiciones.id_requisicion IS 'Código único formato REQ-00001';
COMMENT ON COLUMN requisiciones.quien_ejecuta IS 'Compras: el usuario no puede editar. Proceso Autónomo: sí puede.';
COMMENT ON COLUMN requisiciones.eliminado IS 'Soft delete: true = eliminada lógicamente';

CREATE INDEX IF NOT EXISTS idx_requisiciones_user_id ON requisiciones(user_id);
CREATE INDEX IF NOT EXISTS idx_requisiciones_estado ON requisiciones(estado);
CREATE INDEX IF NOT EXISTS idx_requisiciones_proceso ON requisiciones(proceso);
CREATE INDEX IF NOT EXISTS idx_requisiciones_fecha ON requisiciones(fecha);
CREATE INDEX IF NOT EXISTS idx_requisiciones_eliminado ON requisiciones(eliminado);
CREATE INDEX IF NOT EXISTS idx_requisiciones_id_req ON requisiciones(id_requisicion);

CREATE OR REPLACE FUNCTION generar_id_requisicion()
RETURNS TRIGGER AS $$
BEGIN
    NEW.id_requisicion := 'REQ-' || LPAD(NEW.id::TEXT, 5, '0');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_generar_id_requisicion ON requisiciones;
CREATE TRIGGER trigger_generar_id_requisicion
    BEFORE INSERT ON requisiciones
    FOR EACH ROW
    EXECUTE FUNCTION generar_id_requisicion();

CREATE OR REPLACE FUNCTION validar_estado_cumplido()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.estado = 'Cumplido' THEN
        IF NEW.fecha_entrega IS NULL THEN
            RAISE EXCEPTION 'Debe ingresar la fecha de entrega para marcar como Cumplido';
        END IF;
        IF NEW.numero_factura IS NULL OR NEW.numero_factura = '' THEN
            RAISE EXCEPTION 'Debe ingresar el número de factura para marcar como Cumplido';
        END IF;
        IF NEW.fecha_factura IS NULL THEN
            RAISE EXCEPTION 'Debe ingresar la fecha de factura para marcar como Cumplido';
        END IF;
        IF NEW.valor_real_compra IS NULL OR NEW.valor_real_compra <= 0 THEN
            RAISE EXCEPTION 'Debe ingresar el valor real de la compra para marcar como Cumplido';
        END IF;
    END IF;

    IF OLD.eliminado = true AND NEW.eliminado = true THEN
        IF OLD.estado != NEW.estado OR OLD.objeto_compra != NEW.objeto_compra THEN
            RAISE EXCEPTION 'No se puede editar una requisición eliminada';
        END IF;
    END IF;

    IF NEW.eliminado = true AND OLD.eliminado = false AND OLD.estado = 'Cumplido' THEN
        RAISE EXCEPTION 'No se puede eliminar una requisición ya cumplida';
    END IF;

    NEW.updated_at := now();

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_validar_estado ON requisiciones;
CREATE TRIGGER trigger_validar_estado
    BEFORE UPDATE ON requisiciones
    FOR EACH ROW
    EXECUTE FUNCTION validar_estado_cumplido();

CREATE TABLE IF NOT EXISTS historial_cambios (
    id BIGSERIAL PRIMARY KEY,
    requisicion_id BIGINT NOT NULL REFERENCES requisiciones(id),
    id_requisicion TEXT NOT NULL,
    user_id UUID NOT NULL REFERENCES auth.users(id),
    nombre_usuario TEXT NOT NULL,
    accion TEXT NOT NULL CHECK (accion IN ('creacion', 'edicion', 'eliminacion', 'cambio_estado', 'restauracion')),
    campo_modificado TEXT,
    valor_anterior TEXT,
    valor_nuevo TEXT,
    detalle TEXT,
    fecha TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE historial_cambios IS 'Registro de auditoría de todas las acciones sobre requisiciones';

CREATE INDEX IF NOT EXISTS idx_historial_requisicion ON historial_cambios(requisicion_id);
CREATE INDEX IF NOT EXISTS idx_historial_fecha ON historial_cambios(fecha);
CREATE INDEX IF NOT EXISTS idx_historial_user ON historial_cambios(user_id);


CREATE OR REPLACE FUNCTION actualizar_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_updated_at_perfiles ON perfiles;
CREATE TRIGGER trigger_updated_at_perfiles
    BEFORE UPDATE ON perfiles
    FOR EACH ROW
    EXECUTE FUNCTION actualizar_updated_at();

ALTER TABLE perfiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE requisiciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE historial_cambios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuarios ven su perfil"
    ON perfiles FOR SELECT
    USING (id = auth.uid());

CREATE POLICY "Admins ven todos los perfiles"
    ON perfiles FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM perfiles
            WHERE id = auth.uid() AND rol = 'administrador'
        )
    );

CREATE POLICY "Admins crean perfiles"
    ON perfiles FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM perfiles
            WHERE id = auth.uid() AND rol = 'administrador'
        )
        OR id = auth.uid()
    );

CREATE POLICY "Admins actualizan perfiles"
    ON perfiles FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM perfiles
            WHERE id = auth.uid() AND rol = 'administrador'
        )
    );


CREATE POLICY "Usuarios ven sus requisiciones"
    ON requisiciones FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "Admins ven todas las requisiciones"
    ON requisiciones FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM perfiles
            WHERE id = auth.uid() AND rol = 'administrador'
        )
    );

CREATE POLICY "Usuarios crean requisiciones"
    ON requisiciones FOR INSERT
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Usuarios editan sus requisiciones"
    ON requisiciones FOR UPDATE
    USING (user_id = auth.uid());

CREATE POLICY "Admins editan requisiciones"
    ON requisiciones FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM perfiles
            WHERE id = auth.uid() AND rol = 'administrador'
        )
    );


CREATE POLICY "Usuarios ven su historial"
    ON historial_cambios FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "Admins ven todo el historial"
    ON historial_cambios FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM perfiles
            WHERE id = auth.uid() AND rol = 'administrador'
        )
    );

CREATE POLICY "Usuarios insertan historial"
    ON historial_cambios FOR INSERT
    WITH CHECK (user_id = auth.uid());




CREATE OR REPLACE FUNCTION obtener_estadisticas(p_user_id UUID DEFAULT NULL)
RETURNS JSON AS $$
DECLARE
    resultado JSON;
    es_admin BOOLEAN;
BEGIN
    SELECT (rol = 'administrador') INTO es_admin
    FROM perfiles
    WHERE id = auth.uid();

    SELECT json_build_object(
        'total', COUNT(*) FILTER (WHERE NOT eliminado),
        'pendientes', COUNT(*) FILTER (WHERE estado = 'Pendiente' AND NOT eliminado),
        'en_proceso', COUNT(*) FILTER (WHERE estado = 'En proceso' AND NOT eliminado),
        'cumplidas', COUNT(*) FILTER (WHERE estado = 'Cumplido' AND NOT eliminado),
        'eliminadas', COUNT(*) FILTER (WHERE eliminado),
        'tiempo_promedio_cumplimiento_dias', ROUND(
            AVG(
                EXTRACT(EPOCH FROM (updated_at - created_at)) / 86400
            ) FILTER (WHERE estado = 'Cumplido' AND NOT eliminado)::NUMERIC,
            1
        )
    ) INTO resultado
    FROM requisiciones
    WHERE
        CASE
            WHEN es_admin THEN true
            ELSE user_id = auth.uid()
        END;

    RETURN resultado;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION crear_perfil_usuario(
    p_user_id UUID,
    p_nombre TEXT,
    p_proceso TEXT,
    p_rol TEXT DEFAULT 'usuario'
)
RETURNS void AS $$
BEGIN
    INSERT INTO perfiles (id, nombre_completo, proceso, rol)
    VALUES (p_user_id, p_nombre, p_proceso, p_rol)
    ON CONFLICT (id) DO UPDATE
    SET nombre_completo = p_nombre,
        proceso = p_proceso,
        rol = p_rol,
        updated_at = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


SELECT table_name, table_type
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
