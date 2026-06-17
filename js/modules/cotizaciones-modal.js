/**
 * ============================================================
 * MÓDULO: GESTIÓN DE COTIZACIONES
 * ============================================================
 * Modal para que Compras gestione una o varias cotizaciones
 * de proveedores asociadas a una requisición.
 *
 * Vista del jefe: panel de solo lectura para apoyar la decisión
 * de aprobar o rechazar.
 * ============================================================
 */

import {
    obtenerCotizaciones,
    crearCotizacion,
    actualizarCotizacion,
    eliminarCotizacion,
    marcarSeleccionada,
    subirArchivoCotizacion,
    obtenerUrlFirmadaCotizacion
} from '../services/cotizaciones.service.js';
import { registrarHistorial } from '../services/requisiciones.service.js';
import { Modal } from '../components/modal.js';
import { Toast } from '../components/toast.js';
import { Loader } from '../components/loader.js';

/* ============================================================
   HELPERS
   ============================================================ */

function formatearCOP(valor) {
    const n = Number(valor || 0);
    return '$' + n.toLocaleString('es-CO');
}

function escapeHtml(s) {
    if (s === null || s === undefined) return '';
    return String(s)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

/* ============================================================
   PERMISOS
   ============================================================ */

export function puedeGestionarCotizaciones(perfil) {
    return ['administrador', 'super_admin', 'admin_compras'].includes(perfil.rol);
}

/* ============================================================
   MODAL PRINCIPAL DE GESTIÓN (Compras)
   ============================================================ */

export async function abrirGestorCotizaciones(req, usuario, perfil, onActualizado) {
    Loader.mostrar('Cargando cotizaciones...');
    const { cotizaciones, error } = await obtenerCotizaciones(req.id);
    Loader.ocultar();

    if (error) {
        Toast.error('No se pudieron cargar las cotizaciones.');
        return;
    }

    const html = construirHTMLGestor(req, cotizaciones);

    Modal.crear({
        titulo: `Cotizaciones — ${req.id_requisicion}`,
        contenido: html,
        ancho: '760px',
        botones: [
            { texto: 'Cerrar', clase: 'btn-secundario', onClick: () => { Modal.cerrar(); if (onActualizado) onActualizado(); } }
        ]
    });

    // Engancho los listeners después de que el modal está en el DOM
    setTimeout(() => {
        configurarListenersGestor(req, usuario, perfil, cotizaciones, onActualizado);
    }, 50);
}

/**
 * Construir el HTML del gestor de cotizaciones
 */
function construirHTMLGestor(req, cotizaciones) {
    const cabecera = `
        <div class="cot-cabecera">
            <div class="cot-cabecera-info">
                <div class="cot-eyebrow">Objeto de compra</div>
                <div class="cot-objeto">${escapeHtml(req.objeto_compra)}</div>
                <div class="cot-meta">
                    Cantidad: <strong>${req.cantidad}</strong>
                    ${req.rango_precios ? `· Rango estimado: <strong>${escapeHtml(req.rango_precios)}</strong>` : ''}
                </div>
            </div>
            ${req.aprobacion_pendiente
                ? '<div class="cot-aviso-aprob"><span class="cot-icono-aprob">⏳</span><div><strong>Pendiente de aprobación</strong><br><span>El jefe aún debe aprobar. Puedes ir cargando cotizaciones mientras tanto.</span></div></div>'
                : '<div class="cot-aviso-ok"><span class="cot-icono-aprob">✓</span><div><strong>Aprobada por el jefe</strong><br><span>Puedes continuar el flujo cuando termines de cotizar.</span></div></div>'
            }
        </div>
    `;

    const listaHTML = construirHTMLLista(cotizaciones);

    const formulario = `
        <div class="cot-form" id="cot-form" style="display:none;">
            <div class="cot-form-titulo" id="cot-form-titulo">Nueva cotización</div>
            <input type="hidden" id="cot-edit-id" value="">
            <div class="cot-form-grid">
                <div class="input-grupo">
                    <label class="input-label">Proveedor <span class="requerido">*</span></label>
                    <input type="text" id="cot-proveedor" class="input-campo" placeholder="Nombre del proveedor">
                </div>
                <div class="input-grupo">
                    <label class="input-label">Valor (COP) <span class="requerido">*</span></label>
                    <input type="text" id="cot-valor" class="input-campo" placeholder="Ej: 1.500.000" inputmode="numeric">
                </div>
                <div class="input-grupo">
                    <label class="input-label">Tiempo de entrega</label>
                    <input type="text" id="cot-tiempo" class="input-campo" placeholder="Ej: 5 días hábiles">
                </div>
                <div class="input-grupo">
                    <label class="input-label">Archivo (PDF/imagen, opcional)</label>
                    <input type="file" id="cot-archivo" class="input-campo" accept=".pdf,.png,.jpg,.jpeg">
                    <div class="cot-archivo-actual" id="cot-archivo-actual" style="display:none;"></div>
                </div>
            </div>
            <div class="input-grupo">
                <label class="input-label">Observaciones</label>
                <textarea id="cot-observaciones" class="input-campo" rows="2" placeholder="Detalles, condiciones, garantía..."></textarea>
            </div>
            <div class="cot-form-acciones">
                <button type="button" class="btn btn-secundario" id="cot-cancelar">Cancelar</button>
                <button type="button" class="btn btn-primario" id="cot-guardar">Guardar cotización</button>
            </div>
        </div>
    `;

    return `
        ${cabecera}
        <div class="cot-toolbar">
            <div class="cot-contador">
                <span class="cot-contador-numero" id="cot-contador-numero">${cotizaciones.length}</span>
                <span class="cot-contador-label">cotización${cotizaciones.length === 1 ? '' : 'es'} cargada${cotizaciones.length === 1 ? '' : 's'}</span>
            </div>
            <button type="button" class="btn btn-primario" id="cot-btn-agregar">
                <span class="cot-icono-mas">+</span> Agregar cotización
            </button>
        </div>
        <div class="cot-lista" id="cot-lista">
            ${listaHTML}
        </div>
        ${formulario}
    `;
}

/**
 * Construir HTML de la lista de cotizaciones
 */
function construirHTMLLista(cotizaciones) {
    if (cotizaciones.length === 0) {
        return `
            <div class="cot-vacio">
                <div class="cot-vacio-icono">📋</div>
                <div class="cot-vacio-titulo">Aún no hay cotizaciones</div>
                <div class="cot-vacio-texto">Agrega la primera propuesta de proveedor para iniciar la comparación.</div>
            </div>
        `;
    }

    return cotizaciones.map((c, idx) => `
        <div class="cot-card ${c.seleccionada ? 'cot-card-ganadora' : ''}" data-cot-id="${c.id}" style="animation-delay:${idx * 0.07}s;">
            ${c.seleccionada ? '<div class="cot-cinta-ganadora">★ GANADORA</div>' : ''}
            <div class="cot-card-cabecera">
                <div class="cot-card-proveedor">
                    <div class="cot-card-avatar">${escapeHtml(c.proveedor.charAt(0).toUpperCase())}</div>
                    <div>
                        <div class="cot-card-nombre">${escapeHtml(c.proveedor)}</div>
                        <div class="cot-card-fecha">${new Date(c.created_at).toLocaleDateString('es-CO')} · ${escapeHtml(c.creado_por_nombre)}</div>
                    </div>
                </div>
                <div class="cot-card-valor">${formatearCOP(c.valor)}</div>
            </div>
            <div class="cot-card-detalles">
                ${c.tiempo_entrega ? `<div class="cot-card-chip"><span>⏱</span> ${escapeHtml(c.tiempo_entrega)}</div>` : ''}
                ${c.archivo_url ? `<div class="cot-card-chip cot-card-chip-archivo" data-cot-archivo="${escapeHtml(c.archivo_url)}"><span>📎</span> Ver archivo</div>` : ''}
            </div>
            ${c.observaciones ? `<div class="cot-card-obs">${escapeHtml(c.observaciones)}</div>` : ''}
            <div class="cot-card-acciones">
                ${c.seleccionada
                    ? '<button type="button" class="btn-cot-mini btn-cot-ganadora-activa" disabled>★ Ganadora</button>'
                    : `<button type="button" class="btn-cot-mini btn-cot-marcar" data-accion-cot="marcar" data-cot-id="${c.id}">☆ Marcar ganadora</button>`
                }
                <button type="button" class="btn-cot-mini btn-cot-editar" data-accion-cot="editar" data-cot-id="${c.id}">Editar</button>
                <button type="button" class="btn-cot-mini btn-cot-eliminar" data-accion-cot="eliminar" data-cot-id="${c.id}">Eliminar</button>
            </div>
        </div>
    `).join('');
}

/**
 * Configurar todos los listeners del gestor
 */
function configurarListenersGestor(req, usuario, perfil, cotizacionesIniciales, onActualizado) {
    let cotizacionesActuales = [...cotizacionesIniciales];

    const $ = (id) => document.getElementById(id);

    // Mostrar formulario para nueva cotización
    $('cot-btn-agregar')?.addEventListener('click', () => abrirFormulario(null));

    // Cancelar formulario
    $('cot-cancelar')?.addEventListener('click', () => cerrarFormulario());

    // Formato del campo valor (sin librerías)
    $('cot-valor')?.addEventListener('input', (e) => {
        const numeros = e.target.value.replace(/[^0-9]/g, '');
        e.target.value = numeros ? Number(numeros).toLocaleString('es-CO') : '';
    });

    // Guardar (crear o actualizar)
    $('cot-guardar')?.addEventListener('click', async () => {
        const editId = $('cot-edit-id').value;
        const proveedor = $('cot-proveedor').value.trim();
        const valorRaw = $('cot-valor').value.replace(/[^0-9]/g, '');
        const valor = parseInt(valorRaw, 10);
        const tiempo = $('cot-tiempo').value.trim();
        const observaciones = $('cot-observaciones').value.trim();
        const archivoInput = $('cot-archivo');
        const archivo = archivoInput.files[0] || null;

        if (!proveedor) { Toast.advertencia('Ingrese el proveedor.'); return; }
        if (!valor || valor <= 0) { Toast.advertencia('Ingrese un valor válido.'); return; }

        Loader.mostrar('Guardando cotización...');

        // Subir archivo si hay
        let archivoPath = null;
        let archivoNombre = null;
        if (archivo) {
            const r = await subirArchivoCotizacion(archivo, req.id);
            if (r.error) {
                Loader.ocultar();
                Toast.error('No se pudo subir el archivo: ' + r.error);
                return;
            }
            archivoPath = r.path;
            archivoNombre = archivo.name;
        }

        const datos = {
            proveedor,
            valor,
            tiempo_entrega: tiempo,
            observaciones,
            ...(archivoPath ? { archivo_url: archivoPath, archivo_nombre: archivoNombre } : {})
        };

        let resultado;
        if (editId) {
            resultado = await actualizarCotizacion(parseInt(editId), datos);
        } else {
            resultado = await crearCotizacion({
                requisicion_id: req.id,
                ...datos,
                creado_por: usuario.id,
                creado_por_nombre: perfil.nombre_completo
            });
        }

        Loader.ocultar();

        if (resultado.error) {
            Toast.error('Error al guardar: ' + resultado.error);
            return;
        }

        // Registrar en historial
        await registrarHistorial({
            requisicion_id: req.id,
            id_requisicion: req.id_requisicion,
            user_id: usuario.id,
            nombre_usuario: perfil.nombre_completo,
            accion: 'edicion',
            campo_modificado: 'cotizaciones',
            detalle: editId
                ? `Cotización actualizada: ${proveedor} — ${formatearCOP(valor)}`
                : `Cotización agregada: ${proveedor} — ${formatearCOP(valor)}`
        });

        Toast.exito(editId ? 'Cotización actualizada.' : 'Cotización agregada.');
        await recargarLista();
        cerrarFormulario();
    });

    // Delegación de eventos en la lista
    $('cot-lista')?.addEventListener('click', async (e) => {
        const target = e.target.closest('[data-accion-cot]') || e.target.closest('[data-cot-archivo]');
        if (!target) return;

        // Ver archivo
        const archivoPath = target.dataset.cotArchivo;
        if (archivoPath) {
            const url = await obtenerUrlFirmadaCotizacion(archivoPath);
            if (url) window.open(url, '_blank');
            else Toast.error('No se pudo abrir el archivo.');
            return;
        }

        const cotId = parseInt(target.dataset.cotId);
        const cotizacion = cotizacionesActuales.find(c => c.id === cotId);
        if (!cotizacion) return;

        switch (target.dataset.accionCot) {
            case 'marcar':
                await accionMarcarGanadora(cotizacion);
                break;
            case 'editar':
                abrirFormulario(cotizacion);
                break;
            case 'eliminar':
                await accionEliminar(cotizacion);
                break;
        }
    });

    // ─── Funciones internas ───

    function abrirFormulario(cotizacion) {
        const form = $('cot-form');
        $('cot-form-titulo').textContent = cotizacion ? 'Editar cotización' : 'Nueva cotización';
        $('cot-edit-id').value = cotizacion ? cotizacion.id : '';
        $('cot-proveedor').value = cotizacion?.proveedor || '';
        $('cot-valor').value = cotizacion ? Number(cotizacion.valor).toLocaleString('es-CO') : '';
        $('cot-tiempo').value = cotizacion?.tiempo_entrega || '';
        $('cot-observaciones').value = cotizacion?.observaciones || '';
        $('cot-archivo').value = '';

        const archivoActual = $('cot-archivo-actual');
        if (cotizacion?.archivo_nombre) {
            archivoActual.style.display = 'block';
            archivoActual.innerHTML = `📎 Archivo actual: <strong>${escapeHtml(cotizacion.archivo_nombre)}</strong> <span style="opacity:0.7;">(subir uno nuevo lo reemplaza)</span>`;
        } else {
            archivoActual.style.display = 'none';
            archivoActual.innerHTML = '';
        }

        form.style.display = 'block';
        form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        $('cot-proveedor').focus();
    }

    function cerrarFormulario() {
        $('cot-form').style.display = 'none';
        $('cot-edit-id').value = '';
        $('cot-proveedor').value = '';
        $('cot-valor').value = '';
        $('cot-tiempo').value = '';
        $('cot-observaciones').value = '';
        $('cot-archivo').value = '';
    }

    async function accionMarcarGanadora(cotizacion) {
        Loader.mostrar('Marcando como ganadora...');
        const { exito, error } = await marcarSeleccionada(cotizacion.id, req.id);
        Loader.ocultar();
        if (!exito) { Toast.error('No se pudo marcar: ' + error); return; }

        await registrarHistorial({
            requisicion_id: req.id,
            id_requisicion: req.id_requisicion,
            user_id: usuario.id,
            nombre_usuario: perfil.nombre_completo,
            accion: 'edicion',
            campo_modificado: 'cotizacion_ganadora',
            detalle: `Cotización ganadora: ${cotizacion.proveedor} — ${formatearCOP(cotizacion.valor)}`
        });

        Toast.exito('Cotización marcada como ganadora.');
        await recargarLista();
    }

    async function accionEliminar(cotizacion) {
        if (!confirm(`¿Eliminar la cotización de ${cotizacion.proveedor}?`)) return;
        Loader.mostrar('Eliminando...');
        const { exito, error } = await eliminarCotizacion(cotizacion.id, cotizacion.archivo_url);
        Loader.ocultar();
        if (!exito) { Toast.error('No se pudo eliminar: ' + error); return; }

        await registrarHistorial({
            requisicion_id: req.id,
            id_requisicion: req.id_requisicion,
            user_id: usuario.id,
            nombre_usuario: perfil.nombre_completo,
            accion: 'edicion',
            campo_modificado: 'cotizaciones',
            detalle: `Cotización eliminada: ${cotizacion.proveedor}`
        });

        Toast.exito('Cotización eliminada.');
        await recargarLista();
    }

    async function recargarLista() {
        const { cotizaciones } = await obtenerCotizaciones(req.id);
        cotizacionesActuales = cotizaciones;
        const lista = $('cot-lista');
        if (lista) lista.innerHTML = construirHTMLLista(cotizaciones);
        const contador = $('cot-contador-numero');
        if (contador) contador.textContent = cotizaciones.length;
        const label = document.querySelector('.cot-contador-label');
        if (label) label.textContent = `cotización${cotizaciones.length === 1 ? '' : 'es'} cargada${cotizaciones.length === 1 ? '' : 's'}`;
    }
}

/* ============================================================
   VISTA SOLO LECTURA PARA EL JEFE (al aprobar)
   ============================================================ */

export async function panelCotizacionesParaAprobacion(requisicionId) {
    const { cotizaciones, error } = await obtenerCotizaciones(requisicionId);
    if (error || cotizaciones.length === 0) {
        return ''; // No mostrar nada si no hay cotizaciones
    }

    const cards = cotizaciones.map((c, idx) => `
        <div class="cot-card-mini ${c.seleccionada ? 'cot-card-mini-ganadora' : ''}" style="animation-delay:${idx * 0.06}s;">
            ${c.seleccionada ? '<div class="cot-mini-cinta">★ Propuesta</div>' : ''}
            <div class="cot-mini-cabecera">
                <strong>${escapeHtml(c.proveedor)}</strong>
                <span class="cot-mini-valor">${formatearCOP(c.valor)}</span>
            </div>
            <div class="cot-mini-meta">
                ${c.tiempo_entrega ? `⏱ ${escapeHtml(c.tiempo_entrega)}` : ''}
                ${c.archivo_url ? `<a href="#" class="cot-mini-link" data-cot-archivo-jefe="${escapeHtml(c.archivo_url)}">📎 Archivo</a>` : ''}
            </div>
            ${c.observaciones ? `<div class="cot-mini-obs">${escapeHtml(c.observaciones)}</div>` : ''}
        </div>
    `).join('');

    return `
        <div class="cot-panel-jefe">
            <div class="cot-panel-jefe-titulo">
                <span>💼</span>
                <span>Cotizaciones aportadas por Compras (${cotizaciones.length})</span>
            </div>
            <div class="cot-panel-jefe-lista">${cards}</div>
        </div>
    `;
}

/**
 * Engancha listeners para abrir archivos desde el panel del jefe
 */
export function engancharListenersPanelJefe() {
    document.querySelectorAll('[data-cot-archivo-jefe]').forEach(el => {
        el.addEventListener('click', async (e) => {
            e.preventDefault();
            const path = e.currentTarget.dataset.cotArchivoJefe;
            const url = await obtenerUrlFirmadaCotizacion(path);
            if (url) window.open(url, '_blank');
            else Toast.error('No se pudo abrir el archivo.');
        });
    });
}
