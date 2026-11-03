

import { supabase } from '../config/supabase.js';
import { subirArchivo, obtenerUrlFirmada } from './tiquetes.service.js';

export async function obtenerReservas(tiqueteId) {
    try {
        const { data, error } = await supabase
            .from('tiquete_reservas')
            .select('*')
            .eq('tiquete_id', tiqueteId)
            .order('created_at', { ascending: true });

        if (error) {
            console.error('Error al obtener reservas:', error);
            return { reservas: [], error: error.message };
        }
        return { reservas: data || [], error: null };
    } catch (err) {
        return { reservas: [], error: 'Error de conexión' };
    }
}


export async function crearReserva(datos) {
    try {
        const { data, error } = await supabase
            .from('tiquete_reservas')
            .insert([datos])
            .select()
            .single();

        if (error) {
            console.error('Error al crear reserva:', error);
            return { reserva: null, error: error.message };
        }
        return { reserva: data, error: null };
    } catch (err) {
        return { reserva: null, error: 'Error de conexión' };
    }
}


export async function actualizarReserva(id, cambios) {
    try {
        const { data, error } = await supabase
            .from('tiquete_reservas')
            .update(cambios)
            .eq('id', id)
            .select()
            .single();

        if (error) return { reserva: null, error: error.message };
        return { reserva: data, error: null };
    } catch (err) {
        return { reserva: null, error: 'Error de conexión' };
    }
}


export async function eliminarReserva(id) {
    try {
        const { error } = await supabase
            .from('tiquete_reservas')
            .delete()
            .eq('id', id);

        if (error) return { exito: false, error: error.message };
        return { exito: true, error: null };
    } catch (err) {
        return { exito: false, error: 'Error de conexión' };
    }
}


export async function subirPdfReserva(file, idTiquete, indice) {
    if (!file) return { path: null, error: 'No se proporcionó archivo' };
    if (file.size > 10 * 1024 * 1024) {
        return { path: null, error: 'El archivo no debe superar 10MB' };
    }
    const prefijo = `${idTiquete}_reserva_${indice}_${Date.now()}`;
    return await subirArchivo(file, 'reservas', prefijo);
}


export async function urlFirmadaReserva(path) {
    return await obtenerUrlFirmada(path);
}


export async function contarReservasPorTiquete(idsTiquetes) {
    try {
        if (!idsTiquetes || idsTiquetes.length === 0) return {};
        const { data, error } = await supabase
            .from('tiquete_reservas')
            .select('tiquete_id')
            .in('tiquete_id', idsTiquetes);
        if (error) { console.error('Error contar reservas:', error); return {}; }
        const conteo = {};
        (data || []).forEach(r => {
            conteo[r.tiquete_id] = (conteo[r.tiquete_id] || 0) + 1;
        });
        return conteo;
    } catch (err) {
        return {};
    }
}
