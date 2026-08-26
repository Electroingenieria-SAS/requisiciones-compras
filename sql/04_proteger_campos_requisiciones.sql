-- ============================================================
-- MIGRACIÓN: PROTECCIÓN DE CAMPOS DE CONTROL EN REQUISICIONES
-- Electroingeniería S.A.S. — Sistema de Requisiciones
-- ============================================================
-- Problema que resuelve:
--   Las políticas RLS de UPDATE solo controlan QUÉ FILAS puede tocar
--   un usuario, no QUÉ CAMPOS. Sin esto, un solicitante puede, desde
--   la consola del navegador, auto-aprobar su requisición, auto-avanzar
--   el estado o cambiar `quien_ejecuta` para darse permisos de edición.
--   Esas reglas vivían solo en el frontend (acciones-requisiciones.js).
--
-- Qué hace:
--   Un trigger BEFORE UPDATE que, si el que edita NO es un rol
--   privilegiado (super_admin / admin_compras) NI el jefe aprobador
--   asignado (jefe_proceso_id) a ESA requisición, impide modificar los
--   campos de control. Un usuario normal solo puede editar los datos
--   descriptivos de su propia requisición.
--
-- IDEMPOTENTE: se puede ejecutar varias veces sin romper nada.
-- ============================================================

CREATE OR REPLACE FUNCTION proteger_campos_requisiciones()
RETURNS TRIGGER AS $$
DECLARE
    v_rol TEXT;
    v_uid UUID := auth.uid();
BEGIN
    SELECT rol INTO v_rol FROM perfiles WHERE id = v_uid;

    -- Actores de confianza: roles privilegiados, o el jefe aprobador
    -- asignado a esta requisición. Ellos pueden mover los campos de control.
    -- ('administrador' se incluye por compatibilidad; hoy no lo usa nadie.)
    IF v_rol IN ('super_admin', 'admin_compras', 'administrador')
       OR v_uid = OLD.jefe_proceso_id THEN
        RETURN NEW;
    END IF;

    -- Cualquier otro (usuario normal): los campos de control deben quedar
    -- EXACTAMENTE iguales entre el antes (OLD) y el después (NEW).
    IF NEW.estado                  IS DISTINCT FROM OLD.estado
       OR NEW.quien_ejecuta        IS DISTINCT FROM OLD.quien_ejecuta
       OR NEW.aprobacion_pendiente IS DISTINCT FROM OLD.aprobacion_pendiente
       OR NEW.jefe_proceso_id      IS DISTINCT FROM OLD.jefe_proceso_id
       OR NEW.user_id              IS DISTINCT FROM OLD.user_id
       OR NEW.solicitante          IS DISTINCT FROM OLD.solicitante
       OR NEW.proceso              IS DISTINCT FROM OLD.proceso
       OR NEW.validacion_presupuestal IS DISTINCT FROM OLD.validacion_presupuestal
       OR NEW.enviada_contabilidad IS DISTINCT FROM OLD.enviada_contabilidad
    THEN
        RAISE EXCEPTION 'No tienes permiso para modificar los campos de control de esta requisición.';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trigger_proteger_campos_requisiciones ON requisiciones;
CREATE TRIGGER trigger_proteger_campos_requisiciones
    BEFORE UPDATE ON requisiciones
    FOR EACH ROW
    EXECUTE FUNCTION proteger_campos_requisiciones();

-- ------------------------------------------------------------
-- VERIFICACIÓN: que el trigger quedó creado
-- ------------------------------------------------------------
SELECT tgname AS trigger, tgenabled AS habilitado
FROM pg_trigger
WHERE tgname = 'trigger_proteger_campos_requisiciones';
