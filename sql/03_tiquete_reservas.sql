-- ============================================================
-- MIGRACIÓN: MÚLTIPLES RESERVAS POR TIQUETE
-- Electroingeniería S.A.S. — Sistema de Requisiciones
-- ============================================================
-- Permite registrar varias reservas (PNR + PDF + observación)
-- asociadas a un mismo tiquete aéreo, cuando Compras hace
-- varias compras separadas para un mismo viaje.
--
-- Los tiquetes antiguos siguen funcionando: el campo
-- `codigo_reserva` y `tiquete_pdf_url` en `tiquetes_aereos`
-- se mantienen para retrocompatibilidad de visualización.
--
-- IDEMPOTENTE: se puede ejecutar varias veces sin romper nada.
-- ============================================================

-- ------------------------------------------------------------
-- PARTE 1: TABLA DE RESERVAS
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS tiquete_reservas (
    id BIGSERIAL PRIMARY KEY,
    tiquete_id BIGINT NOT NULL REFERENCES tiquetes_aereos(id) ON DELETE CASCADE,

    -- Datos de la reserva
    codigo_reserva TEXT NOT NULL,
    tiquete_pdf_url TEXT,
    observacion TEXT DEFAULT '',

    -- Auditoría
    creado_por UUID NOT NULL REFERENCES auth.users(id),
    creado_por_nombre TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE tiquete_reservas IS
'Reservas (PNR + PDF) cargadas por Compras al cumplir un tiquete. Permite varias reservas por tiquete.';

CREATE INDEX IF NOT EXISTS idx_tiquete_reservas_tiquete ON tiquete_reservas(tiquete_id);


-- ------------------------------------------------------------
-- PARTE 2: TRIGGER updated_at
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION actualizar_updated_at_tiquete_reservas()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_updated_at_tiquete_reservas ON tiquete_reservas;
CREATE TRIGGER trigger_updated_at_tiquete_reservas
    BEFORE UPDATE ON tiquete_reservas
    FOR EACH ROW
    EXECUTE FUNCTION actualizar_updated_at_tiquete_reservas();


-- ------------------------------------------------------------
-- PARTE 3: ROW LEVEL SECURITY
-- ------------------------------------------------------------

ALTER TABLE tiquete_reservas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Solicitantes ven reservas de sus tiquetes" ON tiquete_reservas;
DROP POLICY IF EXISTS "Admins ven todas las reservas de tiquetes" ON tiquete_reservas;
DROP POLICY IF EXISTS "Admin compras crea reservas" ON tiquete_reservas;
DROP POLICY IF EXISTS "Admin compras edita reservas" ON tiquete_reservas;
DROP POLICY IF EXISTS "Admin compras elimina reservas" ON tiquete_reservas;

-- SELECT: el solicitante o jefe del tiquete las ven
CREATE POLICY "Solicitantes ven reservas de sus tiquetes"
    ON tiquete_reservas FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM tiquetes_aereos
            WHERE tiquetes_aereos.id = tiquete_reservas.tiquete_id
              AND (
                  tiquetes_aereos.user_id = auth.uid()
                  OR tiquetes_aereos.jefe_aprobador_id = auth.uid()
              )
        )
    );

-- SELECT: administradores y compras ven todo
CREATE POLICY "Admins ven todas las reservas de tiquetes"
    ON tiquete_reservas FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM perfiles
            WHERE id = auth.uid()
              AND rol IN ('administrador', 'super_admin', 'admin_compras')
        )
    );

-- INSERT/UPDATE/DELETE: solo Compras y administradores
CREATE POLICY "Admin compras crea reservas"
    ON tiquete_reservas FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM perfiles
            WHERE id = auth.uid()
              AND rol IN ('administrador', 'super_admin', 'admin_compras')
        )
    );

CREATE POLICY "Admin compras edita reservas"
    ON tiquete_reservas FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM perfiles
            WHERE id = auth.uid()
              AND rol IN ('administrador', 'super_admin', 'admin_compras')
        )
    );

CREATE POLICY "Admin compras elimina reservas"
    ON tiquete_reservas FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM perfiles
            WHERE id = auth.uid()
              AND rol IN ('administrador', 'super_admin', 'admin_compras')
        )
    );


-- ------------------------------------------------------------
-- PARTE 4: MIGRAR RESERVAS EXISTENTES (BACKFILL)
-- ------------------------------------------------------------
-- Para los tiquetes que ya tienen codigo_reserva en la tabla
-- principal, creamos su reserva equivalente en la nueva tabla.
-- Esto permite que el frontend muestre TODO desde una sola
-- fuente sin lógica de retrocompatibilidad compleja.
-- ------------------------------------------------------------

INSERT INTO tiquete_reservas (tiquete_id, codigo_reserva, tiquete_pdf_url, creado_por, creado_por_nombre, created_at)
SELECT
    t.id,
    t.codigo_reserva,
    t.tiquete_pdf_url,
    COALESCE(t.entregado_por, t.user_id),
    COALESCE(
        (SELECT nombre_completo FROM perfiles WHERE id = COALESCE(t.entregado_por, t.user_id)),
        'Sistema (migración)'
    ),
    COALESCE(t.fecha_entrega, t.created_at)
FROM tiquetes_aereos t
WHERE t.codigo_reserva IS NOT NULL
  AND t.codigo_reserva <> ''
  AND NOT EXISTS (
      SELECT 1 FROM tiquete_reservas r WHERE r.tiquete_id = t.id
  );


-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
SELECT
    'Migración aplicada' AS estado,
    (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'tiquete_reservas') AS tabla_creada,
    (SELECT COUNT(*) FROM tiquete_reservas) AS reservas_totales,
    (SELECT COUNT(DISTINCT tiquete_id) FROM tiquete_reservas) AS tiquetes_con_reserva;
