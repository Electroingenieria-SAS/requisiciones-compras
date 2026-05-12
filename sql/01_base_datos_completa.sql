-- ============================================================
-- SISTEMA DE REQUISICIONES DE COMPRAS ADMINISTRATIVAS
-- Electroingeniería S.A.S.
-- Base de datos completa - PostgreSQL / Supabase
-- ============================================================
-- INSTRUCCIONES:
-- 1. Ve a tu proyecto en Supabase
-- 2. En el menú lateral izquierdo, haz clic en "SQL Editor"
-- 3. Copia y pega TODO este contenido
-- 4. Haz clic en "Run" (el botón verde)
-- 5. Deberías ver "Success" al final
-- ============================================================


-- ============================================================
-- PARTE 1: TABLA DE PERFILES DE USUARIO
-- ============================================================
-- Esta tabla guarda la información de cada usuario:
-- su nombre, su proceso (área), su rol, etc.
-- Se conecta automáticamente con la autenticación de Supabase.

CREATE TABLE IF NOT EXISTS perfiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    nombre_completo TEXT NOT NULL,
    proceso TEXT NOT NULL,
    rol TEXT NOT NULL DEFAULT 'usuario' CHECK (rol IN ('administrador', 'usuario')),
    activo BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Comentarios descriptivos en la tabla
COMMENT ON TABLE perfiles IS 'Perfiles de usuarios del sistema de requisiciones';
COMMENT ON COLUMN perfiles.proceso IS 'Área/proceso al que pertenece el usuario';
COMMENT ON COLUMN perfiles.rol IS 'Rol del usuario: administrador o usuario';


-- ============================================================
-- PARTE 2: SECUENCIA PARA IDs DE REQUISICIONES
-- ============================================================
-- Esto genera números consecutivos automáticos (1, 2, 3...)
-- que luego se convierten en REQ-00001, REQ-00002, etc.
-- Soporta hasta 99,999 requisiciones.

CREATE SEQUENCE IF NOT EXISTS requisiciones_consecutivo_seq
    START WITH 1
    INCREMENT BY 1
    MINVALUE 1
    MAXVALUE 99999
    NO CYCLE;


-- ============================================================
-- PARTE 3: TABLA PRINCIPAL DE REQUISICIONES
-- ============================================================
-- Esta es la tabla más importante del sistema.
-- Guarda toda la información de cada requisición de compra.

CREATE TABLE IF NOT EXISTS requisiciones (
    -- Identificación
    id BIGINT PRIMARY KEY DEFAULT nextval('requisiciones_consecutivo_seq'),
    id_requisicion TEXT UNIQUE NOT NULL,

    -- Datos automáticos (no editables)
    fecha TIMESTAMPTZ NOT NULL DEFAULT now(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    solicitante TEXT NOT NULL,
    proceso TEXT NOT NULL,

    -- Datos de la solicitud
    unidad_negocio TEXT NOT NULL,
    centro_costo TEXT NOT NULL,
    lugar_entrega TEXT NOT NULL,
    objeto_compra TEXT NOT NULL,

    -- Detalles del producto
    marca_sugerida TEXT DEFAULT '',
    proveedor_sugerido TEXT DEFAULT '',
    cantidad INTEGER NOT NULL CHECK (cantidad > 0),
    color TEXT DEFAULT '',
    dimensiones TEXT DEFAULT '',
    rango_precios TEXT DEFAULT '',
    url_referencia TEXT DEFAULT '',
    observaciones TEXT DEFAULT '',

    -- Ejecución de compra
    quien_ejecuta TEXT NOT NULL CHECK (quien_ejecuta IN ('Compras', 'Proceso Autónomo')),

    -- Estado y seguimiento
    estado TEXT NOT NULL DEFAULT 'Pendiente' CHECK (estado IN ('Pendiente', 'En proceso', 'Cumplido')),

    -- Campos obligatorios cuando estado = 'Cumplido'
    fecha_entrega DATE,
    numero_factura TEXT,
    fecha_factura DATE,
    valor_real_compra NUMERIC(15, 2),

    -- Control administrativo
    validacion_presupuestal TEXT DEFAULT 'Pendiente',
    enviada_contabilidad TEXT DEFAULT 'No',

    -- Soft delete (eliminación lógica)
    eliminado BOOLEAN NOT NULL DEFAULT false,
    motivo_eliminacion TEXT,
    eliminado_por TEXT,
    fecha_eliminacion TIMESTAMPTZ,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Comentarios descriptivos
COMMENT ON TABLE requisiciones IS 'Requisiciones de compras administrativas';
COMMENT ON COLUMN requisiciones.id_requisicion IS 'Código único formato REQ-00001';
COMMENT ON COLUMN requisiciones.quien_ejecuta IS 'Compras: el usuario no puede editar. Proceso Autónomo: sí puede.';
COMMENT ON COLUMN requisiciones.eliminado IS 'Soft delete: true = eliminada lógicamente';

-- Índices para mejorar rendimiento en búsquedas y filtros
CREATE INDEX IF NOT EXISTS idx_requisiciones_user_id ON requisiciones(user_id);
CREATE INDEX IF NOT EXISTS idx_requisiciones_estado ON requisiciones(estado);
CREATE INDEX IF NOT EXISTS idx_requisiciones_proceso ON requisiciones(proceso);
CREATE INDEX IF NOT EXISTS idx_requisiciones_fecha ON requisiciones(fecha);
CREATE INDEX IF NOT EXISTS idx_requisiciones_eliminado ON requisiciones(eliminado);
CREATE INDEX IF NOT EXISTS idx_requisiciones_id_req ON requisiciones(id_requisicion);


-- ============================================================
-- PARTE 4: FUNCIÓN PARA GENERAR ID AUTOMÁTICO (REQ-00001)
-- ============================================================
-- Esta función se ejecuta automáticamente cada vez que se crea
-- una nueva requisición. Toma el número consecutivo y lo convierte
-- al formato REQ-00001.

CREATE OR REPLACE FUNCTION generar_id_requisicion()
RETURNS TRIGGER AS $$
BEGIN
    NEW.id_requisicion := 'REQ-' || LPAD(NEW.id::TEXT, 5, '0');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger: se activa ANTES de insertar cada nueva requisición
DROP TRIGGER IF EXISTS trigger_generar_id_requisicion ON requisiciones;
CREATE TRIGGER trigger_generar_id_requisicion
    BEFORE INSERT ON requisiciones
    FOR EACH ROW
    EXECUTE FUNCTION generar_id_requisicion();


-- ============================================================
-- PARTE 5: FUNCIÓN PARA VALIDAR ESTADO "CUMPLIDO"
-- ============================================================
-- Cuando alguien cambia el estado a "Cumplido", esta función
-- verifica que se hayan llenado los campos obligatorios:
-- fecha_entrega, numero_factura, fecha_factura, valor_real_compra.
-- Si falta alguno, rechaza el cambio.

CREATE OR REPLACE FUNCTION validar_estado_cumplido()
RETURNS TRIGGER AS $$
BEGIN
    -- Validar campos obligatorios al cambiar a Cumplido
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

    -- No permitir editar requisiciones eliminadas
    IF OLD.eliminado = true AND NEW.eliminado = true THEN
        IF OLD.estado != NEW.estado OR OLD.objeto_compra != NEW.objeto_compra THEN
            RAISE EXCEPTION 'No se puede editar una requisición eliminada';
        END IF;
    END IF;

    -- No permitir eliminar requisiciones cumplidas
    IF NEW.eliminado = true AND OLD.eliminado = false AND OLD.estado = 'Cumplido' THEN
        RAISE EXCEPTION 'No se puede eliminar una requisición ya cumplida';
    END IF;

    -- Actualizar timestamp
    NEW.updated_at := now();

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_validar_estado ON requisiciones;
CREATE TRIGGER trigger_validar_estado
    BEFORE UPDATE ON requisiciones
    FOR EACH ROW
    EXECUTE FUNCTION validar_estado_cumplido();


-- ============================================================
-- PARTE 6: TABLA DE HISTORIAL DE CAMBIOS (AUDITORÍA)
-- ============================================================
-- Cada vez que alguien edita o elimina una requisición,
-- se registra aquí: quién lo hizo, cuándo, qué cambió,
-- cuál era el valor anterior y cuál es el nuevo.

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

-- Índices para consultas rápidas del historial
CREATE INDEX IF NOT EXISTS idx_historial_requisicion ON historial_cambios(requisicion_id);
CREATE INDEX IF NOT EXISTS idx_historial_fecha ON historial_cambios(fecha);
CREATE INDEX IF NOT EXISTS idx_historial_user ON historial_cambios(user_id);


-- ============================================================
-- PARTE 7: FUNCIÓN PARA ACTUALIZAR TIMESTAMP AUTOMÁTICAMENTE
-- ============================================================
-- Actualiza el campo updated_at en perfiles cada vez que se modifica.

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


-- ============================================================
-- PARTE 8: SEGURIDAD - ROW LEVEL SECURITY (RLS)
-- ============================================================
-- Esto es crítico. RLS controla quién puede ver y modificar
-- cada fila de la base de datos.
-- Sin esto, cualquier usuario podría ver TODO.

-- Activar RLS en todas las tablas
ALTER TABLE perfiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE requisiciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE historial_cambios ENABLE ROW LEVEL SECURITY;

-- --------------------------------------------------------
-- POLÍTICAS PARA TABLA: perfiles
-- --------------------------------------------------------

-- Los usuarios pueden ver su propio perfil
CREATE POLICY "Usuarios ven su perfil"
    ON perfiles FOR SELECT
    USING (id = auth.uid());

-- Los administradores pueden ver todos los perfiles
CREATE POLICY "Admins ven todos los perfiles"
    ON perfiles FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM perfiles
            WHERE id = auth.uid() AND rol = 'administrador'
        )
    );

-- Los administradores pueden crear perfiles
CREATE POLICY "Admins crean perfiles"
    ON perfiles FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM perfiles
            WHERE id = auth.uid() AND rol = 'administrador'
        )
        OR id = auth.uid()
    );

-- Los administradores pueden actualizar perfiles
CREATE POLICY "Admins actualizan perfiles"
    ON perfiles FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM perfiles
            WHERE id = auth.uid() AND rol = 'administrador'
        )
    );

-- --------------------------------------------------------
-- POLÍTICAS PARA TABLA: requisiciones
-- --------------------------------------------------------

-- Usuarios ven solo sus propias requisiciones
CREATE POLICY "Usuarios ven sus requisiciones"
    ON requisiciones FOR SELECT
    USING (user_id = auth.uid());

-- Administradores ven todas las requisiciones
CREATE POLICY "Admins ven todas las requisiciones"
    ON requisiciones FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM perfiles
            WHERE id = auth.uid() AND rol = 'administrador'
        )
    );

-- Usuarios pueden crear requisiciones (asignadas a sí mismos)
CREATE POLICY "Usuarios crean requisiciones"
    ON requisiciones FOR INSERT
    WITH CHECK (user_id = auth.uid());

-- Usuarios pueden editar sus propias requisiciones
CREATE POLICY "Usuarios editan sus requisiciones"
    ON requisiciones FOR UPDATE
    USING (user_id = auth.uid());

-- Administradores pueden editar cualquier requisición
CREATE POLICY "Admins editan requisiciones"
    ON requisiciones FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM perfiles
            WHERE id = auth.uid() AND rol = 'administrador'
        )
    );

-- --------------------------------------------------------
-- POLÍTICAS PARA TABLA: historial_cambios
-- --------------------------------------------------------

-- Usuarios ven historial de sus propias requisiciones
CREATE POLICY "Usuarios ven su historial"
    ON historial_cambios FOR SELECT
    USING (user_id = auth.uid());

-- Administradores ven todo el historial
CREATE POLICY "Admins ven todo el historial"
    ON historial_cambios FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM perfiles
            WHERE id = auth.uid() AND rol = 'administrador'
        )
    );

-- Cualquier usuario autenticado puede insertar en historial
CREATE POLICY "Usuarios insertan historial"
    ON historial_cambios FOR INSERT
    WITH CHECK (user_id = auth.uid());


-- ============================================================
-- PARTE 9: FUNCIÓN PARA OBTENER ESTADÍSTICAS DEL DASHBOARD
-- ============================================================
-- Esta función calcula todas las métricas del dashboard
-- de forma eficiente en una sola consulta.

CREATE OR REPLACE FUNCTION obtener_estadisticas(p_user_id UUID DEFAULT NULL)
RETURNS JSON AS $$
DECLARE
    resultado JSON;
    es_admin BOOLEAN;
BEGIN
    -- Verificar si el usuario es administrador
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


-- ============================================================
-- PARTE 10: CREAR EL PRIMER USUARIO ADMINISTRADOR
-- ============================================================
-- IMPORTANTE: Este paso se hará DESPUÉS de crear el primer
-- usuario en Supabase Auth. Por ahora dejamos la función lista.
-- No ejecutar aún - se usará en el siguiente paso.

-- Función helper para registrar un perfil después de crear usuario en Auth
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


-- ============================================================
-- VERIFICACIÓN FINAL
-- ============================================================
-- Si todo salió bien, esta consulta muestra las tablas creadas.

SELECT table_name, table_type
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
