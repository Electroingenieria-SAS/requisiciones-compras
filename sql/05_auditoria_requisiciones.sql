-- ============================================================
-- MIGRACIÓN: AUDITORÍA GENERADA POR LA BASE (REQUISICIONES)
-- Electroingeniería S.A.S. — Sistema de Requisiciones
-- ============================================================
-- Problema que resuelve:
--   El historial lo escribía el navegador de forma voluntaria, así que
--   un usuario podía HACER un cambio y NO registrarlo (omisión), o
--   insertar entradas con nombre/fecha falsos. Un registro que se puede
--   omitir no sirve como evidencia.
--
-- Qué hace:
--   Un trigger AFTER INSERT/UPDATE en `requisiciones` genera el historial
--   automáticamente, con el actor REAL (auth.uid() + su nombre de
--   `perfiles`), la fecha real y el antes→después verdadero. Nadie puede
--   omitirlo ni maquillarlo.
--
-- ALCANCE (FASE 1): solo la tabla `requisiciones` (creación, edición,
--   cambio de estado, aprobación/rechazo, eliminación/restauración).
--   Los ítems y las cotizaciones se cubrirán en una FASE 2, y hasta
--   entonces esos eventos los sigue registrando el frontend.
--
-- IDEMPOTENTE: se puede ejecutar varias veces sin romper nada.
-- ============================================================

-- ------------------------------------------------------------
-- PARTE 1: permitir entradas "de sistema" (sin usuario autenticado)
-- ------------------------------------------------------------
-- Cambios hechos con service_role o desde el SQL Editor no tienen
-- auth.uid(). Sin esto, el INSERT del historial fallaría y abortaría
-- el cambio. Se permite user_id nulo (se etiqueta como 'Sistema').
ALTER TABLE historial_cambios ALTER COLUMN user_id DROP NOT NULL;

-- ------------------------------------------------------------
-- PARTE 2: función de auditoría
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION auditar_requisiciones()
RETURNS TRIGGER AS $$
DECLARE
    v_uid    UUID := auth.uid();
    v_nombre TEXT;
    v_col    TEXT;
    v_old    TEXT;
    v_new    TEXT;
    -- Columnas que NO generan entrada de auditoría (metadatos / ruido)
    v_ignorar TEXT[] := ARRAY[
        'id', 'id_requisicion', 'created_at', 'updated_at',
        'eliminado', 'motivo_eliminacion', 'eliminado_por', 'fecha_eliminacion'
    ];
BEGIN
    SELECT nombre_completo INTO v_nombre FROM perfiles WHERE id = v_uid;
    v_nombre := COALESCE(v_nombre, 'Sistema');

    -- CREACIÓN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO historial_cambios (requisicion_id, id_requisicion, user_id, nombre_usuario, accion, detalle)
        VALUES (NEW.id, NEW.id_requisicion, v_uid, v_nombre, 'creacion', 'Requisición creada');
        RETURN NEW;
    END IF;

    -- ELIMINACIÓN / RESTAURACIÓN (evento único, no se listan otros diffs)
    IF OLD.eliminado = false AND NEW.eliminado = true THEN
        INSERT INTO historial_cambios (requisicion_id, id_requisicion, user_id, nombre_usuario, accion, detalle)
        VALUES (NEW.id, NEW.id_requisicion, v_uid, v_nombre, 'eliminacion',
                COALESCE('Motivo: ' || NEW.motivo_eliminacion, 'Eliminada'));
        RETURN NEW;
    ELSIF OLD.eliminado = true AND NEW.eliminado = false THEN
        INSERT INTO historial_cambios (requisicion_id, id_requisicion, user_id, nombre_usuario, accion, detalle)
        VALUES (NEW.id, NEW.id_requisicion, v_uid, v_nombre, 'restauracion', 'Requisición restaurada');
        RETURN NEW;
    END IF;

    -- EDICIÓN / CAMBIO DE ESTADO: una entrada por cada columna que cambió
    FOR v_col, v_old, v_new IN
        SELECT o.key, o.value, n.value
        FROM jsonb_each_text(to_jsonb(OLD)) o
        JOIN jsonb_each_text(to_jsonb(NEW)) n ON o.key = n.key
        WHERE o.value IS DISTINCT FROM n.value
          AND o.key <> ALL (v_ignorar)
    LOOP
        INSERT INTO historial_cambios (requisicion_id, id_requisicion, user_id, nombre_usuario, accion, campo_modificado, valor_anterior, valor_nuevo)
        VALUES (
            NEW.id, NEW.id_requisicion, v_uid, v_nombre,
            CASE WHEN v_col = 'estado' THEN 'cambio_estado' ELSE 'edicion' END,
            v_col, v_old, v_new
        );
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trigger_auditar_requisiciones ON requisiciones;
CREATE TRIGGER trigger_auditar_requisiciones
    AFTER INSERT OR UPDATE ON requisiciones
    FOR EACH ROW
    EXECUTE FUNCTION auditar_requisiciones();

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
SELECT tgname AS trigger, tgenabled AS habilitado
FROM pg_trigger
WHERE tgname = 'trigger_auditar_requisiciones';
