/**
 * ============================================================
 * SERVICIO: REQUISICIONES
 * ============================================================
 * Maneja todas las operaciones CRUD de requisiciones
 * con Supabase (crear, leer, editar, eliminar).
 * ============================================================
 */

import { supabase } from '../config/supabase.js';

/**
 * Crear una nueva requisición
 * @param {Object} datos - Datos del formulario
 * @returns {Object} { requisicion, error }
 */
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

/**
 * Insertar los ítems de una requisición
 * @param {number} requisicionId - ID de la requisición (encabezado)
 * @param {Array} items - Lista de ítems { orden, descripcion, cantidad, valor_estimado, color, dimensiones, marca_sugerida, proveedor_sugerido }
 * @returns {Object} { items, error }
 */
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

/**
 * Obtener los ítems de una requisición
 * @param {number} requisicionId - ID de la requisición
 * @returns {Object} { items, error }
 */
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

/**
 * Borrado FÍSICO de una requisición (solo para rollback interno si fallan los ítems)
 * @param {number} id - ID de la requisición
 */
export async function eliminarRequisicionFisica(id) {
    try {
        await supabase.from('requisiciones').delete().eq('id', id);
    } catch (err) {
        console.error('Error en rollback de requisición:', err);
    }
}

/**
 * Reemplazar TODOS los ítems de una requisición (usado al editar).
 * Inserta los nuevos y luego borra los viejos, para no dejar la
 * requisición sin ítems si algo falla a mitad de camino.
 * @param {number} requisicionId
 * @param {Array} items
 * @returns {Object} { error }
 */
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

/**
 * Obtener requisiciones con filtros opcionales
 * @param {Object} filtros - { estado, proceso, desde, hasta, busqueda }
 * @param {Object} perfil - Perfil del usuario actual
 * @returns {Object} { requisiciones, error }
 */
export async function obtenerRequisiciones(filtros = {}, perfil = null) {
    try {
        let query = supabase
            .from('requisiciones')
            .select('*')
            .order('created_at', { ascending: false });

        // Filtro por estado
        if (filtros.estado && filtros.estado !== 'todos') {
            query = query.eq('estado', filtros.estado);
        }

        // Filtro por proceso
        if (filtros.proceso && filtros.proceso !== 'todos') {
            query = query.eq('proceso', filtros.proceso);
        }

        // Filtro por rango de fechas
        if (filtros.desde) {
            query = query.gte('fecha', filtros.desde);
        }
        if (filtros.hasta) {
            query = query.lte('fecha', filtros.hasta + 'T23:59:59');
        }

        // Filtro por búsqueda (en objeto_compra, solicitante, id_requisicion)
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

/**
 * Obtener una requisición por su ID
 * @param {number} id - ID numérico de la requisición
 * @returns {Object} { requisicion, error }
 */
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

/**
 * Actualizar una requisición existente
 * @param {number} id - ID de la requisición
 * @param {Object} cambios - Campos a actualizar
 * @returns {Object} { requisicion, error }
 */
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

/**
 * Eliminar requisición (soft delete)
 * @param {number} id - ID de la requisición
 * @param {string} motivo - Motivo de eliminación
 * @param {string} nombreUsuario - Quién elimina
 * @returns {Object} { exito, error }
 */
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

/**
 * Registrar cambio en historial de auditoría
 * @param {Object} datos - { requisicion_id, id_requisicion, user_id, nombre_usuario, accion, campo_modificado, valor_anterior, valor_nuevo, detalle }
 */
export async function registrarHistorial(datos) {
    try {
        await supabase
            .from('historial_cambios')
            .insert([datos]);
    } catch (err) {
        console.error('Error al registrar historial:', err);
    }
}

/**
 * Obtener estadísticas para el dashboard
 * @returns {Object} Estadísticas
 */
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

/**
 * Traduce errores de Supabase/PostgreSQL al español
 */
function traducirErrorReq(mensaje) {
    if (mensaje.includes('fecha de entrega')) return 'Debe ingresar la fecha de entrega para marcar como Cumplido.';
    if (mensaje.includes('número de factura')) return 'Debe ingresar el número de factura para marcar como Cumplido.';
    if (mensaje.includes('fecha de factura')) return 'Debe ingresar la fecha de factura para marcar como Cumplido.';
    if (mensaje.includes('valor real')) return 'Debe ingresar el valor real de la compra para marcar como Cumplido.';
    if (mensaje.includes('eliminada')) return 'No se puede editar una requisición eliminada.';
    if (mensaje.includes('cumplida')) return 'No se puede eliminar una requisición ya cumplida.';
    return `Error: ${mensaje}`;
}
