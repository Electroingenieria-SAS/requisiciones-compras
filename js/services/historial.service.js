/**
 * ============================================================
 * SERVICIO: HISTORIAL DE CAMBIOS
 * ============================================================
 * Obtiene el registro de auditoría de cada requisición.
 * ============================================================
 */

import { supabase } from '../config/supabase.js';

/**
 * Obtener historial de una requisición específica
 * @param {number} requisicionId - ID numérico de la requisición
 * @returns {Object} { historial, error }
 */
export async function obtenerHistorial(requisicionId) {
    try {
        const { data, error } = await supabase
            .from('historial_cambios')
            .select('*')
            .eq('requisicion_id', requisicionId)
            .order('fecha', { ascending: false });

        if (error) {
            console.error('Error al obtener historial:', error);
            return { historial: [], error: 'Error al cargar el historial.' };
        }

        return { historial: data || [], error: null };
    } catch (err) {
        console.error('Error en obtenerHistorial:', err);
        return { historial: [], error: 'Error de conexión.' };
    }
}

/**
 * Obtener historial completo (para admins)
 * @param {number} limite - Cantidad máxima de registros
 * @returns {Object} { historial, error }
 */
export async function obtenerHistorialGlobal(limite = 100) {
    try {
        const { data, error } = await supabase
            .from('historial_cambios')
            .select('*')
            .order('fecha', { ascending: false })
            .limit(limite);

        if (error) {
            return { historial: [], error: 'Error al cargar el historial global.' };
        }

        return { historial: data || [], error: null };
    } catch (err) {
        return { historial: [], error: 'Error de conexión.' };
    }
}
