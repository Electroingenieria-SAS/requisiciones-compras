/**
 * ============================================================
 * MÓDULO: EXPORTACIÓN A EXCEL
 * ============================================================
 * Genera archivos .xlsx con formato profesional
 * usando la librería SheetJS (xlsx).
 * 
 * Uso:
 *   import { exportarRequisicionesExcel } from '../modules/exportar-excel.js';
 *   exportarRequisicionesExcel(requisiciones, filtrosAplicados);
 * ============================================================
 */

// Importar SheetJS desde CDN
import * as XLSX from 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm';
import { supabase } from '../config/supabase.js';

/**
 * Traer los ítems de varias requisiciones (consulta propia, sin depender
 * de otros módulos, para que el export nunca se caiga en cadena).
 */
async function traerItemsPorRequisiciones(ids) {
    try {
        if (!ids || ids.length === 0) return {};
        const { data, error } = await supabase
            .from('requisicion_items')
            .select('*')
            .in('requisicion_id', ids)
            .order('orden', { ascending: true });
        if (error) return {};
        const mapa = {};
        (data || []).forEach(it => {
            (mapa[it.requisicion_id] = mapa[it.requisicion_id] || []).push(it);
        });
        return mapa;
    } catch (err) {
        return {};
    }
}

/**
 * Exportar requisiciones a Excel con formato profesional
 * @param {Array} requisiciones - Array de requisiciones a exportar
 * @param {Object} info - { empresa, usuario, proceso, filtros }
 */
export async function exportarRequisicionesExcel(requisiciones, info = {}) {
    if (!requisiciones || requisiciones.length === 0) {
        throw new Error('No hay requisiciones para exportar.');
    }

    const empresa = info.empresa || 'Electroingeniería S.A.S.';
    const usuario = info.usuario || '';
    const fechaExport = new Date().toLocaleDateString('es-CO', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });

    // ─── Traer los ítems de todas las requisiciones (para una fila por ítem) ───
    const mapaItems = await traerItemsPorRequisiciones(requisiciones.map(r => r.id));

    // ─── Preparar datos: UNA FILA POR ÍTEM ───
    const datosExcel = [];
    requisiciones.forEach(req => {
        const base = {
            'ID Requisición': req.id_requisicion,
            'Fecha': formatearFechaExcel(req.fecha),
            'Solicitante': req.solicitante,
            'Proceso': req.proceso,
            'Unidad Negocio': req.unidad_negocio,
            'Centro Costo': req.centro_costo,
            'Lugar Entrega': req.lugar_entrega,
            'Objeto de Compra': req.objeto_compra
        };
        const cola = {
            'Valor Total Requisición': req.valor_estimado ? Number(req.valor_estimado) : (req.rango_precios || ''),
            'URL Referencia': req.url_referencia || '',
            'Observaciones': req.observaciones || '',
            'Quién Ejecuta': req.quien_ejecuta,
            'Estado': req.eliminado ? 'Eliminada' : req.estado,
            'Validación Presupuestal': req.validacion_presupuestal || '',
            'Enviada Contabilidad': req.enviada_contabilidad || '',
            'Fecha Entrega': req.fecha_entrega ? formatearFechaExcel(req.fecha_entrega) : '',
            'Nº Factura': req.numero_factura || '',
            'Fecha Factura': req.fecha_factura ? formatearFechaExcel(req.fecha_factura) : '',
            'Valor Real Compra': req.valor_real_compra || '',
            'Motivo Eliminación': req.motivo_eliminacion || '',
            'Eliminado Por': req.eliminado_por || ''
        };

        const items = mapaItems[req.id] || [];
        if (items.length === 0) {
            // Sin ítems (caso raro): una sola fila con los totales del encabezado
            datosExcel.push({
                ...base,
                'Ítem #': '', 'Descripción Ítem': '', 'Cantidad': req.cantidad || '',
                'Color': '', 'Dimensiones': '', 'Marca Sugerida': '', 'Proveedor Sugerido': '', 'Valor Ítem': '',
                ...cola
            });
        } else {
            items.forEach((it, idx) => {
                datosExcel.push({
                    ...base,
                    'Ítem #': it.orden || (idx + 1),
                    'Descripción Ítem': it.descripcion || '',
                    'Cantidad': it.cantidad,
                    'Color': it.color || '',
                    'Dimensiones': it.dimensiones || '',
                    'Marca Sugerida': it.marca_sugerida || '',
                    'Proveedor Sugerido': it.proveedor_sugerido || '',
                    'Valor Ítem': it.valor_estimado ? Number(it.valor_estimado) : '',
                    ...cola
                });
            });
        }
    });

    // ─── Crear libro de Excel ───
    const wb = XLSX.utils.book_new();

    // ─── Crear filas de encabezado corporativo ───
    const encabezado = [
        [empresa],
        ['REQUISICIONES DE COMPRAS ADMINISTRATIVAS'],
        [`Fecha de exportación: ${fechaExport}  |  Exportado por: ${usuario}  |  Total registros: ${requisiciones.length}`],
        [info.filtros || 'Sin filtros aplicados'],
        [] // Fila vacía de separación
    ];

    // ─── Crear hoja con encabezado + datos ───
    const ws = XLSX.utils.aoa_to_sheet(encabezado);

    // Agregar datos a partir de la fila 6
    XLSX.utils.sheet_add_json(ws, datosExcel, { origin: 'A6', skipHeader: false });

    // ─── Ajustar ancho de columnas ───
    const columnas = Object.keys(datosExcel[0]);
    ws['!cols'] = columnas.map((col) => {
        // Calcular ancho basado en el contenido
        let maxLen = col.length;
        datosExcel.forEach(fila => {
            const val = String(fila[col] || '');
            if (val.length > maxLen) maxLen = val.length;
        });
        return { wch: Math.min(Math.max(maxLen + 2, 10), 50) };
    });

    // ─── Merge de celdas del encabezado ───
    const totalCols = columnas.length;
    ws['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: totalCols - 1 } },  // Empresa
        { s: { r: 1, c: 0 }, e: { r: 1, c: totalCols - 1 } },  // Título
        { s: { r: 2, c: 0 }, e: { r: 2, c: totalCols - 1 } },  // Info exportación
        { s: { r: 3, c: 0 }, e: { r: 3, c: totalCols - 1 } },  // Filtros
    ];

    // ─── Agregar hoja al libro ───
    XLSX.utils.book_append_sheet(wb, ws, 'Requisiciones');

    // ─── Crear hoja de resumen ───
    const resumen = crearHojaResumen(requisiciones, empresa, fechaExport);
    XLSX.utils.book_append_sheet(wb, resumen, 'Resumen');

    // ─── Generar nombre del archivo ───
    const fechaArchivo = new Date().toISOString().split('T')[0];
    const nombreArchivo = `Requisiciones_${empresa.replace(/\s/g, '_')}_${fechaArchivo}.xlsx`;

    // ─── Descargar (Blob + enlace: método robusto para el navegador) ───
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombreArchivo;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1500);

    return nombreArchivo;
}

/**
 * Crear hoja de resumen con estadísticas
 */
function crearHojaResumen(requisiciones, empresa, fechaExport) {
    const activas = requisiciones.filter(r => !r.eliminado);
    const pendientes = activas.filter(r => r.estado === 'Pendiente').length;
    const enCotizacion = activas.filter(r => r.estado === 'En cotización').length;
    const enProceso = activas.filter(r => r.estado === 'En proceso').length;
    const cumplidas = activas.filter(r => r.estado === 'Cumplido').length;
    const eliminadas = requisiciones.filter(r => r.eliminado).length;

    // Valor total de compras cumplidas
    const valorTotal = activas
        .filter(r => r.estado === 'Cumplido' && r.valor_real_compra)
        .reduce((sum, r) => sum + Number(r.valor_real_compra), 0);

    // Requisiciones por proceso
    const porProceso = {};
    activas.forEach(r => {
        porProceso[r.proceso] = (porProceso[r.proceso] || 0) + 1;
    });

    // Requisiciones por ejecutor
    const porEjecutor = {};
    activas.forEach(r => {
        porEjecutor[r.quien_ejecuta] = (porEjecutor[r.quien_ejecuta] || 0) + 1;
    });

    const datos = [
        [empresa],
        ['RESUMEN DE REQUISICIONES'],
        [`Fecha: ${fechaExport}`],
        [],
        ['ESTADÍSTICAS GENERALES'],
        ['Métrica', 'Valor'],
        ['Total requisiciones activas', activas.length],
        ['Pendientes', pendientes],
        ['En cotización', enCotizacion],
        ['En proceso', enProceso],
        ['Cumplidas', cumplidas],
        ['Eliminadas', eliminadas],
        ['Valor total compras cumplidas', valorTotal > 0 ? `$${valorTotal.toLocaleString('es-CO')}` : '$0'],
        [],
        ['REQUISICIONES POR PROCESO'],
        ['Proceso', 'Cantidad'],
        ...Object.entries(porProceso).sort((a, b) => b[1] - a[1]),
        [],
        ['REQUISICIONES POR EJECUTOR'],
        ['Ejecutor', 'Cantidad'],
        ...Object.entries(porEjecutor)
    ];

    const ws = XLSX.utils.aoa_to_sheet(datos);

    ws['!cols'] = [{ wch: 35 }, { wch: 20 }];
    ws['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 1 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: 1 } },
        { s: { r: 2, c: 0 }, e: { r: 2, c: 1 } },
    ];

    return ws;
}

/**
 * Formatear fecha para Excel
 */
function formatearFechaExcel(fecha) {
    if (!fecha) return '';
    const d = new Date(fecha);
    return d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
