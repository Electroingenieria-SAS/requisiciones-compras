/**
 * ============================================================
 * MÓDULO: ACCIONES DE REQUISICIONES
 * ============================================================
 * Maneja ver detalle, editar, eliminar y cambiar estado.
 * Aplica reglas de negocio y permisos.
 * ============================================================
 */

import { actualizarRequisicion, eliminarRequisicion, registrarHistorial, obtenerItems, reemplazarItems } from '../services/requisiciones.service.js';
import { obtenerHistorial } from '../services/historial.service.js';
import { formatearFecha, formatearMoneda, formatearFechaHora } from '../utils/formatters.js';
import { Modal } from '../components/modal.js';
import { Toast } from '../components/toast.js';

/* ── Helpers de escape ── */
function escaparHtml(s) {
    return String(s ?? '')
        .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}
function escaparAttr(s) {
    return String(s ?? '').replaceAll('"', '&quot;');
}

/**
 * Helper: verifica si el usuario tiene delegación sobre el dueño de la requisición
 */
function esDelegadoDe(req, perfil) {
    return Array.isArray(perfil.idsDelegados) && perfil.idsDelegados.includes(req.user_id);
}

/**
 * Verificar si el usuario puede editar una requisición
 */
export function puedeEditar(req, perfil) {
    if (req.eliminado) return false;
    if (req.estado === 'Cumplido') return false;
    if (req.estado === 'Pendiente aprobación') return false;
    if (req.estado === 'Rechazada') {
        return req.user_id === perfil.id;
    }
    // Super admin puede editar todo
    if (perfil.rol === 'super_admin' || perfil.rol === 'administrador') return true;
    // Admin de compras puede editar requisiciones aprobadas (para correcciones operativas)
    if (perfil.rol === 'admin_compras') return true;
    // Delegado: puede editar requisiciones de Proceso Autónomo de las personas asignadas
    if (esDelegadoDe(req, perfil) && req.quien_ejecuta === 'Proceso Autónomo') return true;
    if (req.user_id !== perfil.id) return false;
    if (req.quien_ejecuta === 'Compras') return false;
    return true;
}

/**
 * Verificar si el usuario puede eliminar una requisición
 */
export function puedeEliminar(req, perfil) {
    if (req.eliminado) return false;
    if (req.estado === 'Cumplido') return false;
    if (req.estado === 'Pendiente aprobación') return false;
    // Solo el super admin puede eliminar requisiciones aprobadas
    if (perfil.rol === 'super_admin' || perfil.rol === 'administrador') return true;
    // El admin de compras NO elimina (solo gestiona)
    if (perfil.rol === 'admin_compras') return false;
    if (req.user_id !== perfil.id) return false;
    if (req.quien_ejecuta === 'Compras') return false;
    return true;
}

/**
 * Verificar si el usuario puede cambiar estado
 *
 * Reglas:
 * - Si está en "Pendiente aprobación": admin_compras puede mover SOLO a "En cotización"
 *   (se valida después en cambiarEstado). El resto sigue bloqueado.
 * - Si está en "En cotización" con aprobación pendiente: admin_compras NO puede avanzar.
 * - Si ya fue aprobada (aprobacion_pendiente=false): flujo normal.
 */
export function puedeCambiarEstado(req, perfil) {
    if (req.eliminado) return false;
    if (req.estado === 'Cumplido') return false;
    if (req.estado === 'Rechazada') return false;

    // CASO ESPECIAL: pendiente de aprobación
    if (req.estado === 'Pendiente aprobación') {
        // Solo Compras puede moverla a "En cotización" mientras espera aprobación
        if (perfil.rol === 'admin_compras' || perfil.rol === 'administrador' || perfil.rol === 'super_admin') {
            return true;
        }
        return false;
    }

    // CASO ESPECIAL: en cotización pero aún sin aprobación del jefe
    // Compras puede editar cotizaciones, pero NO avanzar a En proceso/Cumplido
    if (req.estado === 'En cotización' && req.aprobacion_pendiente) {
        return false;
    }

    // Super admin puede cambiar estado de cualquier requisición aprobada
    if (perfil.rol === 'super_admin' || perfil.rol === 'administrador') return true;
    // Admin de compras gestiona los estados de las requisiciones aprobadas
    if (perfil.rol === 'admin_compras') return true;
    // Delegado: puede cambiar estado de requisiciones de Proceso Autónomo de las personas asignadas
    if (esDelegadoDe(req, perfil) && req.quien_ejecuta === 'Proceso Autónomo') return true;
    if (req.user_id !== perfil.id) return false;
    if (req.quien_ejecuta === 'Compras') return false;
    return true;
}

/**
 * Verificar si el usuario puede gestionar cotizaciones
 * Compras puede agregarlas desde "Pendiente aprobación" o "En cotización"
 */
export function puedeGestionarCotizaciones(req, perfil) {
    if (req.eliminado) return false;
    if (req.estado === 'Cumplido') return false;
    if (req.estado === 'Rechazada') return false;
    if (!['admin_compras', 'administrador', 'super_admin'].includes(perfil.rol)) return false;
    // Solo en las fases donde tiene sentido cotizar
    return ['Pendiente aprobación', 'En cotización'].includes(req.estado);
}

/**
 * Verificar si el usuario puede aprobar/rechazar una requisición
 * (Funciona para jefes Y directores - quien sea que esté asignado como aprobador)
 *
 * Aprueba si:
 *   - Está en estado "Pendiente aprobación" (caso clásico), O
 *   - Está en "En cotización" pero aprobacion_pendiente=true (Compras ya empezó)
 */
export function puedeAprobar(req, perfil) {
    if (req.eliminado) return false;
    if (req.jefe_proceso_id !== perfil.id) return false;
    // Caso clásico
    if (req.estado === 'Pendiente aprobación') return true;
    // Compras avanzó pero aún falta aprobación
    if (req.estado === 'En cotización' && req.aprobacion_pendiente === true) return true;
    return false;
}

/**
 * Mostrar modal de detalle de requisición
 */
export async function verDetalle(req) {
    const { items } = await obtenerItems(req.id);
    const itemsArr = items || [];
    const totalItems = itemsArr.reduce((s, it) => s + Number(it.valor_estimado || 0), 0);
    const filasItems = itemsArr.map((it, i) => (
        '<tr>' +
        `<td style="padding:0.5rem;border-bottom:1px solid var(--color-gris-light);text-align:center;">${i + 1}</td>` +
        `<td style="padding:0.5rem;border-bottom:1px solid var(--color-gris-light);font-weight:500;">${escaparHtml(it.descripcion)}</td>` +
        `<td style="padding:0.5rem;border-bottom:1px solid var(--color-gris-light);text-align:center;">${it.cantidad}</td>` +
        `<td style="padding:0.5rem;border-bottom:1px solid var(--color-gris-light);">${escaparHtml(it.color) || '-'}</td>` +
        `<td style="padding:0.5rem;border-bottom:1px solid var(--color-gris-light);">${escaparHtml(it.dimensiones) || '-'}</td>` +
        `<td style="padding:0.5rem;border-bottom:1px solid var(--color-gris-light);">${escaparHtml(it.marca_sugerida) || '-'}</td>` +
        `<td style="padding:0.5rem;border-bottom:1px solid var(--color-gris-light);">${escaparHtml(it.proveedor_sugerido) || '-'}</td>` +
        `<td style="padding:0.5rem;border-bottom:1px solid var(--color-gris-light);text-align:right;white-space:nowrap;">$${Number(it.valor_estimado).toLocaleString('es-CO')}</td>` +
        '</tr>'
    )).join('');
    const html = `
        <div style="display: grid; gap: 1rem;">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
                <div>
                    <div style="font-size: 0.75rem; color: var(--color-texto-secundario); margin-bottom: 0.125rem;">ID Requisición</div>
                    <div style="font-weight: 600; color: var(--color-azul);">${req.id_requisicion}</div>
                </div>
                <div>
                    <div style="font-size: 0.75rem; color: var(--color-texto-secundario); margin-bottom: 0.125rem;">Estado</div>
                    <div><span class="badge-estado ${badgeClase(req)}">${req.eliminado ? 'Eliminada' : req.estado}</span></div>
                </div>
                <div>
                    <div style="font-size: 0.75rem; color: var(--color-texto-secundario); margin-bottom: 0.125rem;">Fecha</div>
                    <div style="font-weight: 500;">${formatearFecha(req.fecha)}</div>
                </div>
                <div>
                    <div style="font-size: 0.75rem; color: var(--color-texto-secundario); margin-bottom: 0.125rem;">Solicitante</div>
                    <div style="font-weight: 500;">${req.solicitante}</div>
                </div>
                <div>
                    <div style="font-size: 0.75rem; color: var(--color-texto-secundario); margin-bottom: 0.125rem;">Proceso</div>
                    <div style="font-weight: 500;">${req.proceso}</div>
                </div>
                <div>
                    <div style="font-size: 0.75rem; color: var(--color-texto-secundario); margin-bottom: 0.125rem;">Ejecuta</div>
                    <div style="font-weight: 500;">${req.quien_ejecuta}</div>
                </div>
            </div>

            <hr style="border: none; border-top: 1px solid var(--color-borde);">

            <div>
                <div style="font-size: 0.75rem; color: var(--color-texto-secundario); margin-bottom: 0.125rem;">Objeto de la compra</div>
                <div style="font-weight: 500;">${req.objeto_compra}</div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
                <div>
                    <div style="font-size: 0.75rem; color: var(--color-texto-secundario); margin-bottom: 0.125rem;">Unidad negocio</div>
                    <div style="font-weight: 500;">${req.unidad_negocio}</div>
                </div>
                <div>
                    <div style="font-size: 0.75rem; color: var(--color-texto-secundario); margin-bottom: 0.125rem;">Centro costo</div>
                    <div style="font-weight: 500;">${req.centro_costo}</div>
                </div>
            </div>

            <div>
                <div style="font-size: 0.75rem; color: var(--color-texto-secundario); margin-bottom: 0.375rem;">Ítems de la compra (${itemsArr.length})</div>
                <div style="overflow-x:auto;border:1px solid var(--color-borde);border-radius:var(--radio-md);">
                    <table style="width:100%;border-collapse:collapse;font-size:0.8rem;min-width:640px;">
                        <thead>
                            <tr style="background:var(--color-gris-light);text-align:left;">
                                <th style="padding:0.5rem;text-align:center;">#</th>
                                <th style="padding:0.5rem;">Descripción</th>
                                <th style="padding:0.5rem;text-align:center;">Cant.</th>
                                <th style="padding:0.5rem;">Color</th>
                                <th style="padding:0.5rem;">Dimensiones</th>
                                <th style="padding:0.5rem;">Marca</th>
                                <th style="padding:0.5rem;">Proveedor</th>
                                <th style="padding:0.5rem;text-align:right;">Valor</th>
                            </tr>
                        </thead>
                        <tbody>${filasItems || '<tr><td colspan="8" style="padding:0.75rem;text-align:center;color:var(--color-texto-secundario);">Sin ítems</td></tr>'}</tbody>
                        <tfoot>
                            <tr style="border-top:2px solid var(--color-borde);font-weight:700;">
                                <td colspan="7" style="padding:0.5rem;text-align:right;color:var(--color-texto-secundario);">Total estimado</td>
                                <td style="padding:0.5rem;text-align:right;color:var(--color-azul);white-space:nowrap;">$${totalItems.toLocaleString('es-CO')}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>

            ${req.url_referencia ? `
                <div>
                    <div style="font-size: 0.75rem; color: var(--color-texto-secundario); margin-bottom: 0.125rem;">URL referencia</div>
                    <div><a href="${req.url_referencia}" target="_blank" style="word-break: break-all;">${req.url_referencia}</a></div>
                </div>
            ` : ''}

            <div>
                <div style="font-size: 0.75rem; color: var(--color-texto-secundario); margin-bottom: 0.125rem;">Observaciones</div>
                <div style="font-weight: 500;">${req.observaciones || '-'}</div>
            </div>

            ${req.estado === 'Cumplido' ? `
                <hr style="border: none; border-top: 1px solid var(--color-borde);">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
                    <div>
                        <div style="font-size: 0.75rem; color: var(--color-texto-secundario); margin-bottom: 0.125rem;">Fecha entrega</div>
                        <div style="font-weight: 500;">${formatearFecha(req.fecha_entrega)}</div>
                    </div>
                    <div>
                        <div style="font-size: 0.75rem; color: var(--color-texto-secundario); margin-bottom: 0.125rem;">Nº Factura</div>
                        <div style="font-weight: 500;">${req.numero_factura || '-'}</div>
                    </div>
                    <div>
                        <div style="font-size: 0.75rem; color: var(--color-texto-secundario); margin-bottom: 0.125rem;">Fecha factura</div>
                        <div style="font-weight: 500;">${formatearFecha(req.fecha_factura)}</div>
                    </div>
                    <div>
                        <div style="font-size: 0.75rem; color: var(--color-texto-secundario); margin-bottom: 0.125rem;">Valor real compra</div>
                        <div style="font-weight: 600; color: var(--color-cumplido);">${formatearMoneda(req.valor_real_compra)}</div>
                    </div>
                </div>
            ` : ''}

            ${req.eliminado ? `
                <hr style="border: none; border-top: 1px solid var(--color-borde);">
                <div style="background: var(--color-eliminado-bg); padding: 0.75rem; border-radius: var(--radio-md);">
                    <div style="font-size: 0.75rem; color: var(--color-error); margin-bottom: 0.25rem; font-weight: 600;">Eliminada</div>
                    <div style="font-size: 0.875rem;"><strong>Motivo:</strong> ${req.motivo_eliminacion || '-'}</div>
                    <div style="font-size: 0.75rem; color: var(--color-texto-secundario); margin-top: 0.25rem;">
                        Por: ${req.eliminado_por || '-'} | ${formatearFechaHora(req.fecha_eliminacion)}
                    </div>
                </div>
            ` : ''}
        </div>
    `;

    Modal.crear({
        titulo: `Detalle ${req.id_requisicion}`,
        contenido: html,
        ancho: '700px',
        botones: [{ texto: 'Cerrar', clase: 'btn-secundario', onClick: Modal.cerrar }]
    });
}

/**
 * Mostrar modal de edición
 */
export async function editarRequisicion(req, usuario, perfil, onGuardado) {
    // Cargar los ítems actuales para precargarlos en el formulario
    const { items: itemsOriginales } = await obtenerItems(req.id);
    const originales = itemsOriginales || [];

    const html = `
        <div style="display: grid; gap: 1rem;">
            <div class="input-grupo">
                <label class="input-label">Objeto de la compra <span class="requerido">*</span></label>
                <textarea id="edit-objeto" class="input-campo input-textarea">${escaparHtml(req.objeto_compra)}</textarea>
            </div>

            <div>
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem;">
                    <label class="input-label" style="margin:0;">Ítems de la compra <span class="requerido">*</span></label>
                    <button type="button" id="edit-btn-agregar-item" class="btn btn-secundario" style="padding:0.35rem 0.75rem;font-size:0.78rem;">＋ Agregar ítem</button>
                </div>
                <div id="edit-items-lista"></div>
                <div style="display:flex;justify-content:flex-end;align-items:baseline;gap:0.6rem;margin-top:0.4rem;padding-top:0.6rem;border-top:2px solid var(--color-borde);">
                    <span style="font-size:0.75rem;color:var(--color-texto-secundario);text-transform:uppercase;font-weight:600;">Total estimado</span>
                    <span id="edit-items-total" style="font-size:1.1rem;font-weight:700;color:var(--color-azul);">$0</span>
                </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                <div class="input-grupo">
                    <label class="input-label">URL referencia</label>
                    <input type="url" id="edit-url" class="input-campo" value="${escaparAttr(req.url_referencia)}">
                </div>
                <div class="input-grupo">
                    <label class="input-label">Observaciones</label>
                    <input type="text" id="edit-observaciones" class="input-campo" value="${escaparAttr(req.observaciones)}">
                </div>
            </div>
        </div>
    `;

    Modal.crear({
        titulo: `Editar ${req.id_requisicion}`,
        contenido: html,
        ancho: '720px',
        botones: [
            { texto: 'Cancelar', clase: 'btn-secundario', onClick: Modal.cerrar },
            {
                texto: 'Guardar cambios', clase: 'btn-primario', onClick: async () => {
                    const nuevoObjeto = document.getElementById('edit-objeto').value.trim();
                    const nuevaUrl = document.getElementById('edit-url').value.trim();
                    const nuevasObs = document.getElementById('edit-observaciones').value.trim();

                    if (!nuevoObjeto) { Toast.advertencia('El objeto de compra no puede estar vacío.'); return; }

                    const { items, error: errItems } = _leerItemsEdit();
                    if (errItems) { Toast.advertencia(errItems); return; }

                    // Detectar cambios de encabezado
                    const cambios = {};
                    const cambiosHistorial = [];
                    if (nuevoObjeto !== (req.objeto_compra || '')) {
                        cambios.objeto_compra = nuevoObjeto;
                        cambiosHistorial.push({ campo: 'objeto_compra', anterior: req.objeto_compra || '', nuevo: nuevoObjeto });
                    }
                    if (nuevaUrl !== (req.url_referencia || '')) {
                        cambios.url_referencia = nuevaUrl;
                        cambiosHistorial.push({ campo: 'url_referencia', anterior: req.url_referencia || '', nuevo: nuevaUrl });
                    }
                    if (nuevasObs !== (req.observaciones || '')) {
                        cambios.observaciones = nuevasObs;
                        cambiosHistorial.push({ campo: 'observaciones', anterior: req.observaciones || '', nuevo: nuevasObs });
                    }

                    const itemsCambiaron = _firmaItems(items) !== _firmaItems(originales);

                    if (Object.keys(cambios).length === 0 && !itemsCambiaron) {
                        Toast.info('No hay cambios para guardar.');
                        Modal.cerrar();
                        return;
                    }

                    // Guardar encabezado (si cambió)
                    if (Object.keys(cambios).length > 0) {
                        const { error } = await actualizarRequisicion(req.id, cambios);
                        if (error) { Toast.error(error); return; }
                    }

                    // Guardar ítems (si cambiaron); el trigger recalcula cantidad y total
                    if (itemsCambiaron) {
                        const { error: errRepl } = await reemplazarItems(req.id, items);
                        if (errRepl) { Toast.error(errRepl); return; }
                    }

                    // Historial: cambios de encabezado
                    for (const ch of cambiosHistorial) {
                        await registrarHistorial({
                            requisicion_id: req.id, id_requisicion: req.id_requisicion,
                            user_id: usuario.id, nombre_usuario: perfil.nombre_completo,
                            accion: 'edicion', campo_modificado: ch.campo,
                            valor_anterior: String(ch.anterior), valor_nuevo: String(ch.nuevo),
                            detalle: `Campo "${ch.campo}" modificado`
                        });
                    }
                    // Historial: resumen de ítems
                    if (itemsCambiaron) {
                        const total = items.reduce((s, it) => s + it.valor_estimado, 0);
                        const cantTotal = items.reduce((s, it) => s + it.cantidad, 0);
                        await registrarHistorial({
                            requisicion_id: req.id, id_requisicion: req.id_requisicion,
                            user_id: usuario.id, nombre_usuario: perfil.nombre_completo,
                            accion: 'edicion', campo_modificado: 'items',
                            valor_nuevo: `${items.length} ítem(s), ${cantTotal} und, total $${total.toLocaleString('es-CO')}`,
                            detalle: 'Ítems de la requisición actualizados'
                        });
                    }

                    Toast.exito('Requisición actualizada correctamente.');
                    Modal.cerrar();
                    if (onGuardado) onGuardado();
                }
            }
        ]
    });

    // Precargar ítems y enganchar listeners una vez el modal está en el DOM
    setTimeout(() => {
        const btnAgregar = document.getElementById('edit-btn-agregar-item');
        if (btnAgregar) btnAgregar.addEventListener('click', () => _agregarFilaItemEdit());
        if (originales.length) {
            originales.forEach(it => _agregarFilaItemEdit(it));
        } else {
            _agregarFilaItemEdit();
        }
    }, 50);
}

/* ── Helpers del editor de ítems (modal de edición) ── */
function _filaItemEditHTML(data = {}) {
    const valorInicial = data.valor_estimado ? Number(data.valor_estimado).toLocaleString('es-CO') : '';
    return `
        <div class="edit-item-fila" style="border:1px solid var(--color-borde);border-radius:var(--radio-md);padding:0.75rem;margin-bottom:0.6rem;background:#FCFCFE;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem;">
                <span style="font-size:0.7rem;font-weight:700;color:var(--color-azul);text-transform:uppercase;letter-spacing:0.3px;">Ítem <span class="edit-item-num"></span></span>
                <button type="button" class="edit-btn-borrar-item" style="background:none;border:1px solid var(--color-error);color:var(--color-error);border-radius:var(--radio-sm);padding:0.15rem 0.5rem;font-size:0.72rem;cursor:pointer;">✕ Quitar</button>
            </div>
            <div class="input-grupo" style="margin-bottom:0.5rem;">
                <label class="input-label">Descripción <span class="requerido">*</span></label>
                <input type="text" class="input-campo edit-item-descripcion" placeholder="Ej: Guantes de nitrilo talla M" value="${escaparAttr(data.descripcion)}">
            </div>
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:0.6rem;">
                <div class="input-grupo"><label class="input-label">Cantidad <span class="requerido">*</span></label><input type="number" min="1" class="input-campo edit-item-cantidad" placeholder="0" value="${data.cantidad || ''}"></div>
                <div class="input-grupo"><label class="input-label">Valor (COP) <span style="color:var(--color-error);">*</span></label><input type="text" inputmode="numeric" class="input-campo edit-item-valor" placeholder="Ej: 1500000" value="${valorInicial}"></div>
                <div class="input-grupo"><label class="input-label">Color</label><input type="text" class="input-campo edit-item-color" value="${escaparAttr(data.color)}"></div>
                <div class="input-grupo"><label class="input-label">Dimensiones</label><input type="text" class="input-campo edit-item-dimensiones" value="${escaparAttr(data.dimensiones)}"></div>
                <div class="input-grupo"><label class="input-label">Marca</label><input type="text" class="input-campo edit-item-marca" value="${escaparAttr(data.marca_sugerida)}"></div>
                <div class="input-grupo"><label class="input-label">Proveedor</label><input type="text" class="input-campo edit-item-proveedor" value="${escaparAttr(data.proveedor_sugerido)}"></div>
            </div>
        </div>`;
}

function _agregarFilaItemEdit(data = {}) {
    const lista = document.getElementById('edit-items-lista');
    if (!lista) return;
    lista.insertAdjacentHTML('beforeend', _filaItemEditHTML(data));
    const fila = lista.lastElementChild;
    fila.querySelector('.edit-item-valor').addEventListener('input', (e) => {
        const n = e.target.value.replace(/[^0-9]/g, '');
        e.target.value = n ? parseInt(n, 10).toLocaleString('es-CO') : '';
        _recalcularTotalEdit();
    });
    fila.querySelector('.edit-btn-borrar-item').addEventListener('click', () => {
        if (document.querySelectorAll('#edit-items-lista .edit-item-fila').length <= 1) {
            Toast.advertencia('La requisición debe tener al menos un ítem.');
            return;
        }
        fila.remove();
        _renumerarItemsEdit();
        _recalcularTotalEdit();
    });
    _renumerarItemsEdit();
    _recalcularTotalEdit();
}

function _renumerarItemsEdit() {
    document.querySelectorAll('#edit-items-lista .edit-item-fila').forEach((f, i) => {
        f.querySelector('.edit-item-num').textContent = i + 1;
    });
}

function _recalcularTotalEdit() {
    let total = 0;
    document.querySelectorAll('#edit-items-lista .edit-item-valor').forEach(inp => {
        total += parseInt(inp.value.replace(/[^0-9]/g, ''), 10) || 0;
    });
    const el = document.getElementById('edit-items-total');
    if (el) el.textContent = '$' + total.toLocaleString('es-CO');
}

function _leerItemsEdit() {
    const items = [];
    const filas = document.querySelectorAll('#edit-items-lista .edit-item-fila');
    for (let i = 0; i < filas.length; i++) {
        const f = filas[i];
        const descripcion = f.querySelector('.edit-item-descripcion').value.trim();
        const cantidad = parseInt(f.querySelector('.edit-item-cantidad').value, 10);
        const valor = parseInt(f.querySelector('.edit-item-valor').value.replace(/[^0-9]/g, ''), 10) || 0;
        if (!descripcion) return { error: `El ítem ${i + 1} necesita una descripción.` };
        if (!cantidad || cantidad < 1) return { error: `El ítem ${i + 1} necesita una cantidad válida.` };
        if (!valor || valor <= 0) return { error: `El ítem ${i + 1} necesita un valor estimado.` };
        items.push({
            orden: i + 1, descripcion, cantidad, valor_estimado: valor,
            color: f.querySelector('.edit-item-color').value.trim(),
            dimensiones: f.querySelector('.edit-item-dimensiones').value.trim(),
            marca_sugerida: f.querySelector('.edit-item-marca').value.trim(),
            proveedor_sugerido: f.querySelector('.edit-item-proveedor').value.trim()
        });
    }
    if (items.length === 0) return { error: 'Agregue al menos un ítem.' };
    return { items };
}

function _firmaItems(arr) {
    return JSON.stringify((arr || []).map(it => ({
        d: it.descripcion, c: Number(it.cantidad), v: Number(it.valor_estimado),
        co: it.color || '', di: it.dimensiones || '', ma: it.marca_sugerida || '', pr: it.proveedor_sugerido || ''
    })));
}

/**
 * Mostrar modal de eliminación
 */
export function confirmarEliminar(req, usuario, perfil, onEliminado) {
    const html = `
        <div style="text-align: center; margin-bottom: 1.5rem;">
            <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">⚠️</div>
            <p style="font-size: var(--texto-sm); color: var(--color-texto-secundario);">
                ¿Está seguro de eliminar la requisición <strong>${req.id_requisicion}</strong>?
            </p>
            <p style="font-size: var(--texto-xs); color: var(--color-gris); margin-top: 0.5rem;">
                La requisición no se borrará permanentemente, pero quedará marcada como eliminada.
            </p>
        </div>
        <div class="input-grupo">
            <label class="input-label">Motivo de eliminación <span class="requerido">*</span></label>
            <textarea id="eliminar-motivo" class="input-campo input-textarea" placeholder="Escriba el motivo de la eliminación" rows="3"></textarea>
        </div>
    `;

    Modal.crear({
        titulo: `Eliminar ${req.id_requisicion}`,
        contenido: html,
        ancho: '500px',
        botones: [
            { texto: 'Cancelar', clase: 'btn-secundario', onClick: Modal.cerrar },
            {
                texto: 'Eliminar', clase: 'btn-peligro', onClick: async () => {
                    const motivo = document.getElementById('eliminar-motivo').value.trim();
                    if (!motivo) {
                        Toast.advertencia('Debe ingresar un motivo de eliminación.');
                        return;
                    }

                    const { exito, error } = await eliminarRequisicion(req.id, motivo, perfil.nombre_completo);

                    if (error) {
                        Toast.error(error);
                        return;
                    }

                    await registrarHistorial({
                        requisicion_id: req.id,
                        id_requisicion: req.id_requisicion,
                        user_id: usuario.id,
                        nombre_usuario: perfil.nombre_completo,
                        accion: 'eliminacion',
                        detalle: `Motivo: ${motivo}`
                    });

                    Toast.exito('Requisición eliminada.');
                    Modal.cerrar();
                    if (onEliminado) onEliminado();
                }
            }
        ]
    });
}

/**
 * Mostrar modal de cambio de estado
 *
 * Comportamiento especial:
 * - Desde "Pendiente aprobación": Compras solo puede mover a "En cotización"
 *   (manteniendo aprobacion_pendiente=true, el jefe sigue debiendo aprobar).
 * - Desde "En cotización" con aprobacion_pendiente=true: bloqueado (ver puedeCambiarEstado).
 * - Desde "En cotización" aprobada: flujo normal.
 */
export function cambiarEstado(req, usuario, perfil, onCambiado) {
    // Determinar qué estados puede elegir el usuario según el caso
    let estados;
    let avisoBloqueo = '';

    if (req.estado === 'Pendiente aprobación') {
        // Solo permitir avanzar a "En cotización" en paralelo a la aprobación
        estados = ['En cotización'];
        avisoBloqueo = `
            <div class="cot-aviso-aprob" style="margin-bottom:1rem;">
                <span class="cot-icono-aprob">⏳</span>
                <div>
                    <strong>Aprobación del jefe en curso</strong><br>
                    <span>Puedes mover la requisición a "En cotización" y cargar propuestas, pero no podrás avanzar al flujo de gestión hasta que el jefe apruebe.</span>
                </div>
            </div>
        `;
    } else {
        estados = ['Pendiente', 'En cotización', 'En proceso', 'Cumplido'];
    }

    const estadoActual = req.estado;

    let opcionesHTML = estados
        .filter(e => e !== estadoActual)
        .map(e => `<option value="${e}">${e}</option>`)
        .join('');

    const html = `
        ${avisoBloqueo}
        <div style="margin-bottom: 1rem;">
            <p style="font-size: var(--texto-sm); color: var(--color-texto-secundario);">
                Estado actual: <span class="badge-estado ${badgeClase(req)}">${estadoActual}</span>
            </p>
        </div>
        <div class="input-grupo">
            <label class="input-label">Nuevo estado <span class="requerido">*</span></label>
            <select id="cambio-estado" class="input-campo input-select">
                <option value="">Seleccione...</option>
                ${opcionesHTML}
            </select>
        </div>
        <div id="campos-cumplido" class="oculto" style="margin-top: 1rem;">
            <div style="background: var(--color-cumplido-bg); padding: 0.75rem; border-radius: var(--radio-md); margin-bottom: 1rem; font-size: var(--texto-sm); color: var(--color-cumplido);">
                Para marcar como Cumplido debe completar los siguientes campos obligatorios:
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                <div class="input-grupo">
                    <label class="input-label">Fecha entrega <span class="requerido">*</span></label>
                    <input type="date" id="cumplido-fecha-entrega" class="input-campo">
                </div>
                <div class="input-grupo">
                    <label class="input-label">Nº Factura <span class="requerido">*</span></label>
                    <input type="text" id="cumplido-factura" class="input-campo" placeholder="Número de factura">
                </div>
                <div class="input-grupo">
                    <label class="input-label">Fecha factura <span class="requerido">*</span></label>
                    <input type="date" id="cumplido-fecha-factura" class="input-campo">
                </div>
                <div class="input-grupo">
                    <label class="input-label">Valor real compra (COP) <span class="requerido">*</span></label>
                    <input type="text" id="cumplido-valor" class="input-campo" placeholder="Ej: 500000">
                </div>
            </div>
        </div>
    `;

    Modal.crear({
        titulo: `Cambiar estado - ${req.id_requisicion}`,
        contenido: html,
        ancho: '600px',
        botones: [
            { texto: 'Cancelar', clase: 'btn-secundario', onClick: Modal.cerrar },
            {
                texto: 'Guardar estado', clase: 'btn-primario', onClick: async () => {
                    const nuevoEstado = document.getElementById('cambio-estado').value;
                    if (!nuevoEstado) {
                        Toast.advertencia('Seleccione un estado.');
                        return;
                    }

                    const cambios = { estado: nuevoEstado };

                    if (nuevoEstado === 'Cumplido') {
                        const fechaEntrega = document.getElementById('cumplido-fecha-entrega').value;
                        const factura = document.getElementById('cumplido-factura').value.trim();
                        const fechaFactura = document.getElementById('cumplido-fecha-factura').value;
                        const valorRaw = document.getElementById('cumplido-valor').value.replace(/[^0-9]/g, '');
                        const valorReal = parseInt(valorRaw, 10);

                        if (!fechaEntrega) { Toast.advertencia('Ingrese la fecha de entrega.'); return; }
                        if (!factura) { Toast.advertencia('Ingrese el número de factura.'); return; }
                        if (!fechaFactura) { Toast.advertencia('Ingrese la fecha de factura.'); return; }
                        if (!valorReal || valorReal <= 0) { Toast.advertencia('Ingrese un valor real válido.'); return; }

                        cambios.fecha_entrega = fechaEntrega;
                        cambios.numero_factura = factura;
                        cambios.fecha_factura = fechaFactura;
                        cambios.valor_real_compra = valorReal;
                    }

                    const { requisicion, error } = await actualizarRequisicion(req.id, cambios);

                    if (error) {
                        Toast.error(error);
                        return;
                    }

                    await registrarHistorial({
                        requisicion_id: req.id,
                        id_requisicion: req.id_requisicion,
                        user_id: usuario.id,
                        nombre_usuario: perfil.nombre_completo,
                        accion: 'cambio_estado',
                        campo_modificado: 'estado',
                        valor_anterior: estadoActual,
                        valor_nuevo: nuevoEstado,
                        detalle: `Estado cambiado de "${estadoActual}" a "${nuevoEstado}"`
                    });

                    // Mensaje contextual según la transición
                    if (estadoActual === 'Pendiente aprobación' && nuevoEstado === 'En cotización') {
                        Toast.exito('Requisición lista para cotizar. El jefe aún debe aprobarla para continuar el flujo.');
                    } else {
                        Toast.exito(`Estado cambiado a "${nuevoEstado}".`);
                    }
                    Modal.cerrar();
                    if (onCambiado) onCambiado();
                }
            }
        ]
    });

    // Mostrar campos de cumplido cuando se seleccione
    document.getElementById('cambio-estado').addEventListener('change', (e) => {
        const camposCumplido = document.getElementById('campos-cumplido');
        if (e.target.value === 'Cumplido') {
            camposCumplido.classList.remove('oculto');
        } else {
            camposCumplido.classList.add('oculto');
        }
    });

    // Formato monetario en el campo de valor
    const inputValor = document.getElementById('cumplido-valor');
    if (inputValor) {
        inputValor.addEventListener('input', (e) => {
            let v = e.target.value.replace(/[^0-9]/g, '');
            if (v) e.target.value = parseInt(v, 10).toLocaleString('es-CO');
        });
    }
}

/**
 * Mostrar modal de historial de cambios
 */
export async function verHistorial(req) {
    const { historial, error } = await obtenerHistorial(req.id);

    if (error) {
        Toast.error(error);
        return;
    }

    const accionLabel = {
        'creacion': '🟢 Creación',
        'edicion': '✏️ Edición',
        'eliminacion': '🗑️ Eliminación',
        'cambio_estado': '🔄 Cambio de estado',
        'restauracion': '♻️ Restauración'
    };

    let contenidoHTML;

    if (historial.length === 0) {
        contenidoHTML = `
            <div style="text-align:center;padding:2rem;color:var(--color-texto-secundario);">
                <div style="font-size:2rem;margin-bottom:0.5rem;">📭</div>
                <p>No hay registros de cambios para esta requisición.</p>
            </div>
        `;
    } else {
        contenidoHTML = `
            <div style="font-size:var(--texto-sm);color:var(--color-texto-secundario);margin-bottom:1rem;">
                ${historial.length} registro(s) de cambios
            </div>
            <div style="display:flex;flex-direction:column;gap:0.75rem;max-height:400px;overflow-y:auto;padding-right:0.5rem;">
                ${historial.map(h => {
                    const label = accionLabel[h.accion] || h.accion;
                    let detalle = '';

                    if (h.accion === 'edicion' && h.campo_modificado) {
                        detalle = `
                            <div style="margin-top:0.375rem;padding:0.5rem;background:var(--color-gris-light);border-radius:var(--radio-sm);font-size:0.75rem;">
                                <strong>Campo:</strong> ${h.campo_modificado}<br>
                                <span style="color:var(--color-error);">Antes:</span> ${h.valor_anterior || '(vacío)'}<br>
                                <span style="color:var(--color-cumplido);">Después:</span> ${h.valor_nuevo || '(vacío)'}
                            </div>
                        `;
                    } else if (h.detalle) {
                        detalle = `<div style="margin-top:0.25rem;font-size:0.75rem;color:var(--color-texto-secundario);">${h.detalle}</div>`;
                    }

                    return `
                        <div style="padding:0.75rem;border:1px solid var(--color-borde);border-radius:var(--radio-md);background:white;">
                            <div style="display:flex;justify-content:space-between;align-items:center;">
                                <span style="font-weight:600;font-size:var(--texto-sm);">${label}</span>
                                <span style="font-size:0.7rem;color:var(--color-gris);">${formatearFechaHora(h.fecha)}</span>
                            </div>
                            <div style="font-size:0.8rem;color:var(--color-texto-secundario);margin-top:0.25rem;">
                                Por: <strong>${h.nombre_usuario}</strong>
                            </div>
                            ${detalle}
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }

    Modal.crear({
        titulo: `Historial - ${req.id_requisicion}`,
        contenido: contenidoHTML,
        ancho: '550px',
        botones: [{ texto: 'Cerrar', clase: 'btn-secundario', onClick: Modal.cerrar }]
    });
}

/**
 * Mostrar modal para aprobar o rechazar una requisición
 *
 * Comportamiento:
 * - Si la requisición está en "En cotización" (Compras ya empezó), aprobar
 *   solo cambia aprobacion_pendiente=false y deja el estado intacto.
 * - Si está en "Pendiente aprobación" (caso clásico), aprobar pasa a "Pendiente".
 * - Si hay cotizaciones cargadas, las muestra al jefe como referencia.
 */
export async function aprobarRequisicion(req, usuario, perfil, onProcesado) {
    // Cargar panel de cotizaciones (puede venir vacío)
    let panelCotizaciones = '';
    try {
        const mod = await import('./cotizaciones-modal.js');
        panelCotizaciones = await mod.panelCotizacionesParaAprobacion(req.id);
    } catch (e) { /* sin cotizaciones, sigue */ }

    const estadoOrigen = req.estado;

    const html = `
        <div style="display:grid;gap:1rem;">
            <div style="background:var(--color-azul-light);border-radius:var(--radio-md);padding:1rem;">
                <div style="font-size:var(--texto-xs);color:var(--color-azul);font-weight:600;margin-bottom:0.25rem;">REQUISICIÓN</div>
                <div style="font-weight:600;color:var(--color-azul);font-size:var(--texto-base);">${req.id_requisicion}</div>
                <div style="font-size:var(--texto-sm);color:var(--color-texto);margin-top:0.5rem;">${req.objeto_compra}</div>
                <div style="font-size:var(--texto-xs);color:var(--color-texto-secundario);margin-top:0.5rem;">
                    Solicitante: <strong>${req.solicitante}</strong> · Cantidad: <strong>${req.cantidad}</strong>
                    ${req.valor_estimado ? ` · Valor estimado: <strong>$${Number(req.valor_estimado).toLocaleString('es-CO')}</strong>` : (req.rango_precios ? ` · Rango: <strong>${req.rango_precios}</strong>` : '')}
                </div>
            </div>
            ${panelCotizaciones}
            <div class="input-grupo">
                <label class="input-label">Motivo (obligatorio solo si rechaza)</label>
                <textarea id="motivo-aprobacion" class="input-campo" rows="3" placeholder="Comentario para el solicitante..."></textarea>
            </div>
        </div>
    `;

    Modal.crear({
        titulo: `Aprobar requisición - ${req.id_requisicion}`,
        contenido: html,
        ancho: '600px',
        botones: [
            { texto: 'Cancelar', clase: 'btn-secundario', onClick: Modal.cerrar },
            { texto: 'Rechazar', clase: 'btn-peligro', onClick: async () => {
                const motivo = document.getElementById('motivo-aprobacion').value.trim();
                if (!motivo) { Toast.advertencia('Debe ingresar el motivo del rechazo.'); return; }

                const { error } = await actualizarRequisicion(req.id, {
                    estado: 'Rechazada',
                    motivo_rechazo: motivo,
                    aprobado_por: usuario.id,
                    nombre_aprobador: perfil.nombre_completo,
                    fecha_aprobacion: new Date().toISOString()
                });
                if (error) { Toast.error(error); return; }

                await registrarHistorial({
                    requisicion_id: req.id, id_requisicion: req.id_requisicion,
                    user_id: usuario.id, nombre_usuario: perfil.nombre_completo,
                    accion: 'cambio_estado',
                    campo_modificado: 'estado',
                    valor_anterior: estadoOrigen,
                    valor_nuevo: 'Rechazada',
                    detalle: `Rechazada: ${motivo}`
                });

                Toast.exito('Requisición rechazada. El solicitante será notificado.');
                Modal.cerrar();
                if (onProcesado) onProcesado();
            }},
            { texto: '✓ Aprobar', clase: 'btn-primario', onClick: async () => {
                const motivo = document.getElementById('motivo-aprobacion').value.trim();

                // Si ya está en "En cotización" (Compras adelantó), no cambiar el estado
                // — solo marcar como aprobada para que pueda seguir el flujo.
                const cambios = {
                    aprobado_por: usuario.id,
                    nombre_aprobador: perfil.nombre_completo,
                    fecha_aprobacion: new Date().toISOString(),
                    motivo_rechazo: null,
                    aprobacion_pendiente: false
                };

                let nuevoEstado = estadoOrigen;
                if (estadoOrigen === 'Pendiente aprobación') {
                    cambios.estado = 'Pendiente';
                    nuevoEstado = 'Pendiente';
                }
                // Si estaba en "En cotización", el estado se conserva — Compras sigue trabajando.

                const { error } = await actualizarRequisicion(req.id, cambios);
                if (error) { Toast.error(error); return; }

                await registrarHistorial({
                    requisicion_id: req.id, id_requisicion: req.id_requisicion,
                    user_id: usuario.id, nombre_usuario: perfil.nombre_completo,
                    accion: 'cambio_estado',
                    campo_modificado: estadoOrigen === nuevoEstado ? 'aprobacion' : 'estado',
                    valor_anterior: estadoOrigen,
                    valor_nuevo: nuevoEstado,
                    detalle: motivo
                        ? `Aprobada: ${motivo}`
                        : (estadoOrigen === nuevoEstado
                            ? 'Aprobada por el jefe. Compras continúa el flujo.'
                            : 'Aprobada para gestión de Compras')
                });

                Toast.exito('Requisición aprobada.');
                Modal.cerrar();
                if (onProcesado) onProcesado();
            }}
        ]
    });

    // Engancho los listeners para abrir archivos del panel de cotizaciones
    if (panelCotizaciones) {
        setTimeout(async () => {
            try {
                const mod = await import('./cotizaciones-modal.js');
                mod.engancharListenersPanelJefe();
            } catch (e) { /* no critical */ }
        }, 100);
    }
}

/**
 * Función especial para reenviar una requisición rechazada a aprobación
 */
export async function reenviarAprobacion(req, usuario, perfil, onReenviado) {
    Modal.crear({
        titulo: 'Reenviar a aprobación',
        contenido: `<p>¿Desea reenviar la requisición <strong>${req.id_requisicion}</strong> a aprobación de su jefe? Asegúrese de haber editado los campos necesarios antes de reenviar.</p>`,
        botones: [
            { texto: 'Cancelar', clase: 'btn-secundario', onClick: Modal.cerrar },
            { texto: 'Reenviar', clase: 'btn-primario', onClick: async () => {
                const { error } = await actualizarRequisicion(req.id, {
                    estado: 'Pendiente aprobación',
                    motivo_rechazo: null,
                    aprobado_por: null,
                    nombre_aprobador: null,
                    fecha_aprobacion: null
                });
                if (error) { Toast.error(error); return; }

                await registrarHistorial({
                    requisicion_id: req.id, id_requisicion: req.id_requisicion,
                    user_id: usuario.id, nombre_usuario: perfil.nombre_completo,
                    accion: 'cambio_estado',
                    campo_modificado: 'estado',
                    valor_anterior: 'Rechazada',
                    valor_nuevo: 'Pendiente aprobación',
                    detalle: 'Reenviada a aprobación tras correcciones'
                });

                Toast.exito('Requisición reenviada a aprobación.');
                Modal.cerrar();
                if (onReenviado) onReenviado();
            }}
        ]
    });
}

/**
 * Helper: clase CSS del badge según estado
 */
function badgeClase(req) {
    if (req.eliminado) return 'badge-eliminado';
    const map = {
        'Pendiente aprobación': 'badge-pendiente-aprobacion',
        'Rechazada': 'badge-rechazada',
        'Pendiente': 'badge-pendiente',
        'En cotización': 'badge-en-cotizacion',
        'En proceso': 'badge-en-proceso',
        'Cumplido': 'badge-cumplido'
    };
    return map[req.estado] || '';
}

export { badgeClase };
