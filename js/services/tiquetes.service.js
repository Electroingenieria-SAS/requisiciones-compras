/**
 * ============================================================
 * SERVICIO: TIQUETES AÉREOS
 * ============================================================
 * Maneja CRUD de tiquetes aéreos y upload de documentos a Storage.
 * ============================================================
 */

import { supabase } from '../config/supabase.js';

const BUCKET = 'tiquetes-documentos';

/**
 * Subir un archivo al bucket de Supabase Storage
 */
export async function subirArchivo(file, carpeta, prefijo) {
    try {
        if (!file) return { url: null, path: null, error: 'No se proporcionó archivo' };
        if (file.size > 5 * 1024 * 1024) {
            return { url: null, path: null, error: 'El archivo no debe superar 5MB' };
        }

        const extension = file.name.split('.').pop().toLowerCase();
        const nombreArchivo = `${carpeta}/${prefijo}_${Date.now()}.${extension}`;

        const { data, error } = await supabase.storage
            .from(BUCKET)
            .upload(nombreArchivo, file, { cacheControl: '3600', upsert: false });

        if (error) {
            console.error('Error al subir archivo:', error);
            return { url: null, path: null, error: error.message };
        }

        return { url: data.path, path: data.path, error: null };
    } catch (err) {
        console.error('Error en subirArchivo:', err);
        return { url: null, path: null, error: 'Error al subir archivo' };
    }
}

/**
 * Obtener URL firmada temporal para visualizar un archivo privado
 */
export async function obtenerUrlFirmada(path, segundos = 3600) {
    try {
        if (!path) return null;
        const { data, error } = await supabase.storage
            .from(BUCKET)
            .createSignedUrl(path, segundos);
        if (error) { console.error('Error URL firmada:', error); return null; }
        return data?.signedUrl || null;
    } catch (err) {
        return null;
    }
}

/**
 * Crear un nuevo tiquete
 */
export async function crearTiquete(datos) {
    try {
        const { data, error } = await supabase
            .from('tiquetes_aereos')
            .insert([datos])
            .select()
            .single();
        if (error) {
            console.error('Error al crear tiquete:', error);
            return { tiquete: null, error: error.message };
        }
        return { tiquete: data, error: null };
    } catch (err) {
        return { tiquete: null, error: 'Error de conexión' };
    }
}

/**
 * Obtener tiquetes (RLS filtra automáticamente según el rol)
 */
export async function obtenerTiquetes(filtros = {}) {
    try {
        let query = supabase
            .from('tiquetes_aereos')
            .select('*')
            .eq('eliminado', false)
            .order('created_at', { ascending: false });

        if (filtros.estado && filtros.estado !== 'todos') query = query.eq('estado', filtros.estado);
        if (filtros.desde) query = query.gte('fecha_ida', filtros.desde);
        if (filtros.hasta) query = query.lte('fecha_ida', filtros.hasta);
        if (filtros.busqueda) {
            const b = filtros.busqueda;
            query = query.or(`id_tiquete.ilike.%${b}%,destino.ilike.%${b}%,solicitante.ilike.%${b}%,pasajero_nombre.ilike.%${b}%`);
        }

        const { data, error } = await query;
        if (error) {
            console.error('Error al obtener tiquetes:', error);
            return { tiquetes: [], error: error.message };
        }
        return { tiquetes: data || [], error: null };
    } catch (err) {
        return { tiquetes: [], error: 'Error de conexión' };
    }
}

/**
 * Actualizar un tiquete
 */
export async function actualizarTiquete(id, cambios) {
    try {
        const { data, error } = await supabase
            .from('tiquetes_aereos')
            .update(cambios)
            .eq('id', id)
            .select()
            .single();
        if (error) return { tiquete: null, error: error.message };
        return { tiquete: data, error: null };
    } catch (err) {
        return { tiquete: null, error: 'Error de conexión' };
    }
}

/**
 * Registrar acción en el historial de tiquetes
 */
export async function registrarHistorialTiquete(datos) {
    try {
        const { error } = await supabase.from('historial_tiquetes').insert([datos]);
        if (error) console.error('Error registrando historial tiquete:', error);
    } catch (err) {
        console.error('Error en registrarHistorialTiquete:', err);
    }
}

/**
 * Obtener historial de un tiquete específico
 */
export async function obtenerHistorialTiquete(tiqueteId) {
    try {
        const { data, error } = await supabase
            .from('historial_tiquetes')
            .select('*')
            .eq('tiquete_id', tiqueteId)
            .order('fecha', { ascending: false });
        if (error) return { historial: [], error: error.message };
        return { historial: data || [], error: null };
    } catch (err) {
        return { historial: [], error: 'Error de conexión' };
    }
}
