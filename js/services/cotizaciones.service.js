/**
 * ============================================================
 * SERVICIO: COTIZACIONES
 * ============================================================
 * CRUD de cotizaciones asociadas a requisiciones + manejo
 * de archivos PDF de proveedores en Supabase Storage.
 * ============================================================
 */

import { supabase } from '../config/supabase.js';

const BUCKET = 'cotizaciones-archivos';

/**
 * Obtener todas las cotizaciones de una requisición
 */
export async function obtenerCotizaciones(requisicionId) {
    try {
        const { data, error } = await supabase
            .from('cotizaciones')
            .select('*')
            .eq('requisicion_id', requisicionId)
            .order('seleccionada', { ascending: false })
            .order('created_at', { ascending: true });

        if (error) {
            console.error('Error al obtener cotizaciones:', error);
            return { cotizaciones: [], error: error.message };
        }
        return { cotizaciones: data || [], error: null };
    } catch (err) {
        return { cotizaciones: [], error: 'Error de conexión' };
    }
}

/**
 * Crear una nueva cotización
 */
export async function crearCotizacion(datos) {
    try {
        const { data, error } = await supabase
            .from('cotizaciones')
            .insert([datos])
            .select()
            .single();

        if (error) {
            console.error('Error al crear cotización:', error);
            return { cotizacion: null, error: error.message };
        }
        return { cotizacion: data, error: null };
    } catch (err) {
        return { cotizacion: null, error: 'Error de conexión' };
    }
}

/**
 * Actualizar una cotización
 */
export async function actualizarCotizacion(id, cambios) {
    try {
        const { data, error } = await supabase
            .from('cotizaciones')
            .update(cambios)
            .eq('id', id)
            .select()
            .single();

        if (error) return { cotizacion: null, error: error.message };
        return { cotizacion: data, error: null };
    } catch (err) {
        return { cotizacion: null, error: 'Error de conexión' };
    }
}

/**
 * Eliminar una cotización (y opcionalmente su archivo)
 */
export async function eliminarCotizacion(id, archivoPath = null) {
    try {
        if (archivoPath) {
            // Best effort: borrar el archivo del storage
            await supabase.storage.from(BUCKET).remove([archivoPath]).catch(() => {});
        }
        const { error } = await supabase
            .from('cotizaciones')
            .delete()
            .eq('id', id);

        if (error) return { exito: false, error: error.message };
        return { exito: true, error: null };
    } catch (err) {
        return { exito: false, error: 'Error de conexión' };
    }
}

/**
 * Marcar una cotización como seleccionada (ganadora)
 * El trigger SQL se encarga de desmarcar las otras
 */
export async function marcarSeleccionada(id, requisicionId) {
    try {
        const { error } = await supabase
            .from('cotizaciones')
            .update({ seleccionada: true })
            .eq('id', id)
            .eq('requisicion_id', requisicionId);

        if (error) return { exito: false, error: error.message };
        return { exito: true, error: null };
    } catch (err) {
        return { exito: false, error: 'Error de conexión' };
    }
}

/**
 * Subir archivo de cotización al bucket
 */
export async function subirArchivoCotizacion(file, requisicionId) {
    try {
        if (!file) return { path: null, error: 'No se proporcionó archivo' };
        if (file.size > 5 * 1024 * 1024) {
            return { path: null, error: 'El archivo no debe superar 5MB' };
        }

        const ext = file.name.split('.').pop().toLowerCase();
        const path = `req_${requisicionId}/cot_${Date.now()}.${ext}`;

        const { data, error } = await supabase.storage
            .from(BUCKET)
            .upload(path, file, { cacheControl: '3600', upsert: false });

        if (error) {
            console.error('Error al subir archivo cotización:', error);
            return { path: null, error: error.message };
        }
        return { path: data.path, error: null };
    } catch (err) {
        return { path: null, error: 'Error al subir archivo' };
    }
}

/**
 * Generar URL firmada para visualizar un archivo privado
 */
export async function obtenerUrlFirmadaCotizacion(path, segundos = 3600) {
    try {
        if (!path) return null;
        const { data, error } = await supabase.storage
            .from(BUCKET)
            .createSignedUrl(path, segundos);
        if (error) { console.error('Error URL firmada cotización:', error); return null; }
        return data?.signedUrl || null;
    } catch (err) {
        return null;
    }
}

/**
 * Contar cotizaciones por requisición (para mostrar en tabla principal)
 * Retorna un mapa { requisicion_id: cantidad }
 */
export async function contarCotizacionesPorRequisicion(idsRequisiciones) {
    try {
        if (!idsRequisiciones || idsRequisiciones.length === 0) return {};

        const { data, error } = await supabase
            .from('cotizaciones')
            .select('requisicion_id')
            .in('requisicion_id', idsRequisiciones);

        if (error) { console.error('Error contar cotizaciones:', error); return {}; }

        const conteo = {};
        (data || []).forEach(c => {
            conteo[c.requisicion_id] = (conteo[c.requisicion_id] || 0) + 1;
        });
        return conteo;
    } catch (err) {
        return {};
    }
}
