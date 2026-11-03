

import { supabase } from '../config/supabase.js';


export async function crearRequisicion(datos) {
    try {
        const { data, error } = await supabase
            .from('requisiciones')
            .insert([datos])
            .select()
            .single();

        if (error) {
            console.error('Error al crear requisición:', error);
            return { requisicion: null, error: traducirErrorReq(error.message) };
        }

        return { requisicion: data, error: null };
    } catch (err) {
        console.error('Error en crearRequisicion:', err);
        return { requisicion: null, error: 'Error de conexión al crear la requisición.' };
    }
}


export async function crearItems(requisicionId, items) {
    try {
        const filas = items.map(it => ({ ...it, requisicion_id: requisicionId }));
        const { data, error } = await supabase
            .from('requisicion_items')
            .insert(filas)
            .select();

        if (error) {
            console.error('Error al crear ítems:', error);
            return { items: null, error: traducirErrorReq(error.message) };
        }
        return { items: data, error: null };
    } catch (err) {
        console.error('Error en crearItems:', err);
        return { items: null, error: 'Error de conexión al guardar los ítems.' };
    }
}


export async function obtenerItems(requisicionId) {
    try {
        const { data, error } = await supabase
            .from('requisicion_items')
            .select('*')
            .eq('requisicion_id', requisicionId)
            .order('orden', { ascending: true });

        if (error) {
            console.error('Error al obtener ítems:', error);
            return { items: [], error: traducirErrorReq(error.message) };
        }
        return { items: data || [], error: null };
    } catch (err) {
        return { items: [], error: 'Error de conexión al cargar los ítems.' };
    }
}


export async function eliminarRequisicionFisica(id) {
    try {
        await supabase.from('requisiciones').delete().eq('id', id);
    } catch (err) {
        console.error('Error en rollback de requisición:', err);
    }
}


export async function reemplazarItems(requisicionId, items) {
    try {
        const { data: viejos, error: e1 } = await supabase
            .from('requisicion_items')
            .select('id')
            .eq('requisicion_id', requisicionId);
        if (e1) return { error: traducirErrorReq(e1.message) };

        const idsViejos = (viejos || []).map(v => v.id);
        const filas = items.map(it => ({ ...it, requisicion_id: requisicionId }));

        const { error: e2 } = await supabase.from('requisicion_items').insert(filas);
        if (e2) return { error: traducirErrorReq(e2.message) };

        if (idsViejos.length) {
            const { error: e3 } = await supabase.from('requisicion_items').delete().in('id', idsViejos);
            if (e3) return { error: traducirErrorReq(e3.message) };
        }
        return { error: null };
    } catch (err) {
        console.error('Error en reemplazarItems:', err);
        return { error: 'Error de conexión al actualizar los ítems.' };
    }
}


export async function obtenerRequisiciones(filtros = {}, perfil = null) {
    try {
        let query = supabase
            .from('requisiciones')
            .select('*')
            .order('created_at', { ascending: false });

        if (filtros.estado && filtros.estado !== 'todos') {
            query = query.eq('estado', filtros.estado);
        }

        if (filtros.proceso && filtros.proceso !== 'todos') {
            query = query.eq('proceso', filtros.proceso);
        }

        if (filtros.desde) {
            query = query.gte('fecha', filtros.desde);
        }
        if (filtros.hasta) {
            query = query.lte('fecha', filtros.hasta + 'T23:59:59');
        }

        if (filtros.busqueda) {
            query = query.or(
                `objeto_compra.ilike.%${filtros.busqueda}%,solicitante.ilike.%${filtros.busqueda}%,id_requisicion.ilike.%${filtros.busqueda}%`
            );
        }

        const { data, error } = await query;

        if (error) {
            console.error('Error al obtener requisiciones:', error);
            return { requisiciones: [], error: traducirErrorReq(error.message) };
        }

        return { requisiciones: data || [], error: null };
    } catch (err) {
        console.error('Error en obtenerRequisiciones:', err);
        return { requisiciones: [], error: 'Error de conexión al cargar requisiciones.' };
    }
}

export async function obtenerRequisicionPorId(id) {
    try {
        const { data, error } = await supabase
            .from('requisiciones')
            .select('*')
            .eq('id', id)
            .single();

        if (error) {
            return { requisicion: null, error: 'No se encontró la requisición.' };
        }

        return { requisicion: data, error: null };
    } catch (err) {
        return { requisicion: null, error: 'Error de conexión.' };
    }
}

export async function actualizarRequisicion(id, cambios) {
    try {
        const { data, error } = await supabase
            .from('requisiciones')
            .update(cambios)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('Error al actualizar requisición:', error);
            return { requisicion: null, error: traducirErrorReq(error.message) };
        }

        return { requisicion: data, error: null };
    } catch (err) {
        return { requisicion: null, error: 'Error de conexión al actualizar.' };
    }
}


export async function eliminarRequisicion(id, motivo, nombreUsuario) {
    try {
        const { error } = await supabase
            .from('requisiciones')
            .update({
                eliminado: true,
                motivo_eliminacion: motivo,
                eliminado_por: nombreUsuario,
                fecha_eliminacion: new Date().toISOString()
            })
            .eq('id', id);

        if (error) {
            console.error('Error al eliminar requisición:', error);
            return { exito: false, error: traducirErrorReq(error.message) };
        }

        return { exito: true, error: null };
    } catch (err) {
        return { exito: false, error: 'Error de conexión al eliminar.' };
    }
}

export async function registrarHistorial(datos) {
    try {
        await supabase
            .from('historial_cambios')
            .insert([datos]);
    } catch (err) {
        console.error('Error al registrar historial:', err);
    }
}


export async function obtenerEstadisticas() {
    try {
        const { data, error } = await supabase.rpc('obtener_estadisticas');

        if (error) {
            console.error('Error al obtener estadísticas:', error);
            return null;
        }

        return data;
    } catch (err) {
        console.error('Error en obtenerEstadisticas:', err);
        return null;
    }
}


function traducirErrorReq(mensaje) {
    if (mensaje.includes('fecha de entrega')) return 'Debe ingresar la fecha de entrega para marcar como Cumplido.';
    if (mensaje.includes('número de factura')) return 'Debe ingresar el número de factura para marcar como Cumplido.';
    if (mensaje.includes('fecha de factura')) return 'Debe ingresar la fecha de factura para marcar como Cumplido.';
    if (mensaje.includes('valor real')) return 'Debe ingresar el valor real de la compra para marcar como Cumplido.';
    if (mensaje.includes('eliminada')) return 'No se puede editar una requisición eliminada.';
    if (mensaje.includes('cumplida')) return 'No se puede eliminar una requisición ya cumplida.';
    return `Error: ${mensaje}`;
}
