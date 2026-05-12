/**
 * ============================================================
 * MÓDULO: ACCIONES DE REQUISICIONES
 * ============================================================
 * Maneja ver detalle, editar, eliminar y cambiar estado.
 * Aplica reglas de negocio y permisos.
 * ============================================================
 */

import { actualizarRequisicion, eliminarRequisicion, registrarHistorial } from '../services/requisiciones.service.js';
import { formatearFecha, formatearMoneda, formatearFechaHora } from '../utils/formatters.js';
import { Modal } from '../components/modal.js';
import { Toast } from '../components/toast.js';

/**
 * Verificar si el usuario puede editar una requisición
 */
export function puedeEditar(req, perfil) {
    if (req.eliminado) return false;
    if (req.estado === 'Cumplido') return false;
    if (perfil.rol === 'administrador') return true;
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
    if (perfil.rol === 'administrador') return true;
    if (req.user_id !== perfil.id) return false;
    if (req.quien_ejecuta === 'Compras') return false;
    return true;
}

/**
 * Verificar si el usuario puede cambiar estado
 */
export function puedeCambiarEstado(req, perfil) {
    if (req.eliminado) return false;
    if (req.estado === 'Cumplido') return false;
    if (perfil.rol === 'administrador') return true;
    if (req.user_id !== perfil.id) return false;
    return true;
}

/**
 * Mostrar modal de detalle de requisición
 */
export function verDetalle(req) {
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

            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0.75rem;">
                <div>
                    <div style="font-size: 0.75rem; color: var(--color-texto-secundario); margin-bottom: 0.125rem;">Cantidad</div>
                    <div style="font-weight: 500;">${req.cantidad}</div>
                </div>
                <div>
                    <div style="font-size: 0.75rem; color: var(--color-texto-secundario); margin-bottom: 0.125rem;">Unidad negocio</div>
                    <div style="font-weight: 500;">${req.unidad_negocio}</div>
                </div>
                <div>
                    <div style="font-size: 0.75rem; color: var(--color-texto-secundario); margin-bottom: 0.125rem;">Centro costo</div>
                    <div style="font-weight: 500;">${req.centro_costo}</div>
                </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
                <div>
                    <div style="font-size: 0.75rem; color: var(--color-texto-secundario); margin-bottom: 0.125rem;">Color</div>
                    <div style="font-weight: 500;">${req.color || '-'}</div>
                </div>
                <div>
                    <div style="font-size: 0.75rem; color: var(--color-texto-secundario); margin-bottom: 0.125rem;">Dimensiones</div>
                    <div style="font-weight: 500;">${req.dimensiones || '-'}</div>
                </div>
                <div>
                    <div style="font-size: 0.75rem; color: var(--color-texto-secundario); margin-bottom: 0.125rem;">Marca sugerida</div>
                    <div style="font-weight: 500;">${req.marca_sugerida || '-'}</div>
                </div>
                <div>
                    <div style="font-size: 0.75rem; color: var(--color-texto-secundario); margin-bottom: 0.125rem;">Proveedor sugerido</div>
                    <div style="font-weight: 500;">${req.proveedor_sugerido || '-'}</div>
                </div>
            </div>

            <div>
                <div style="font-size: 0.75rem; color: var(--color-texto-secundario); margin-bottom: 0.125rem;">Rango de precios</div>
                <div style="font-weight: 500;">${req.rango_precios || '-'}</div>
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
export function editarRequisicion(req, usuario, perfil, onGuardado) {
    const html = `
        <div style="display: grid; gap: 1rem;">
            <div class="input-grupo">
                <label class="input-label">Objeto de la compra <span class="requerido">*</span></label>
                <textarea id="edit-objeto" class="input-campo input-textarea">${req.objeto_compra}</textarea>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                <div class="input-grupo">
                    <label class="input-label">Cantidad <span class="requerido">*</span></label>
                    <input type="number" id="edit-cantidad" class="input-campo" value="${req.cantidad}" min="1">
                </div>
                <div class="input-grupo">
                    <label class="input-label">Color</label>
                    <input type="text" id="edit-color" class="input-campo" value="${req.color || ''}">
                </div>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                <div class="input-grupo">
                    <label class="input-label">Dimensiones</label>
                    <input type="text" id="edit-dimensiones" class="input-campo" value="${req.dimensiones || ''}">
                </div>
                <div class="input-grupo">
                    <label class="input-label">Marca sugerida</label>
                    <input type="text" id="edit-marca" class="input-campo" value="${req.marca_sugerida || ''}">
                </div>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                <div class="input-grupo">
                    <label class="input-label">Proveedor sugerido</label>
                    <input type="text" id="edit-proveedor" class="input-campo" value="${req.proveedor_sugerido || ''}">
                </div>
                <div class="input-grupo">
                    <label class="input-label">URL referencia</label>
                    <input type="url" id="edit-url" class="input-campo" value="${req.url_referencia || ''}">
                </div>
            </div>
            <div class="input-grupo">
                <label class="input-label">Observaciones</label>
                <textarea id="edit-observaciones" class="input-campo input-textarea">${req.observaciones || ''}</textarea>
            </div>
        </div>
    `;

    Modal.crear({
        titulo: `Editar ${req.id_requisicion}`,
        contenido: html,
        ancho: '650px',
        botones: [
            { texto: 'Cancelar', clase: 'btn-secundario', onClick: Modal.cerrar },
            {
                texto: 'Guardar cambios', clase: 'btn-primario', onClick: async () => {
                    const cambios = {};
                    const campos = [
                        { id: 'edit-objeto', campo: 'objeto_compra', anterior: req.objeto_compra },
                        { id: 'edit-cantidad', campo: 'cantidad', anterior: req.cantidad, esNumero: true },
                        { id: 'edit-color', campo: 'color', anterior: req.color || '' },
                        { id: 'edit-dimensiones', campo: 'dimensiones', anterior: req.dimensiones || '' },
                        { id: 'edit-marca', campo: 'marca_sugerida', anterior: req.marca_sugerida || '' },
                        { id: 'edit-proveedor', campo: 'proveedor_sugerido', anterior: req.proveedor_sugerido || '' },
                        { id: 'edit-url', campo: 'url_referencia', anterior: req.url_referencia || '' },
                        { id: 'edit-observaciones', campo: 'observaciones', anterior: req.observaciones || '' },
                    ];

                    const cambiosHistorial = [];

                    campos.forEach(c => {
                        let valor = document.getElementById(c.id).value.trim();
                        if (c.esNumero) valor = parseInt(valor, 10);
                        const anterior = c.esNumero ? Number(c.anterior) : (c.anterior || '');

                        if (valor != anterior) {
                            cambios[c.campo] = valor;
                            cambiosHistorial.push({ campo: c.campo, anterior: String(anterior), nuevo: String(valor) });
                        }
                    });

                    if (Object.keys(cambios).length === 0) {
                        Toast.info('No hay cambios para guardar.');
                        Modal.cerrar();
                        return;
                    }

                    if (cambios.objeto_compra !== undefined && !cambios.objeto_compra) {
                        Toast.advertencia('El objeto de compra no puede estar vacío.');
                        return;
                    }
                    if (cambios.cantidad !== undefined && (!cambios.cantidad || cambios.cantidad < 1)) {
                        Toast.advertencia('La cantidad debe ser mayor a 0.');
                        return;
                    }

                    const { requisicion, error } = await actualizarRequisicion(req.id, cambios);

                    if (error) {
                        Toast.error(error);
                        return;
                    }

                    // Registrar cada cambio en historial
                    for (const ch of cambiosHistorial) {
                        await registrarHistorial({
                            requisicion_id: req.id,
                            id_requisicion: req.id_requisicion,
                            user_id: usuario.id,
                            nombre_usuario: perfil.nombre_completo,
                            accion: 'edicion',
                            campo_modificado: ch.campo,
                            valor_anterior: ch.anterior,
                            valor_nuevo: ch.nuevo,
                            detalle: `Campo "${ch.campo}" modificado`
                        });
                    }

                    Toast.exito('Requisición actualizada correctamente.');
                    Modal.cerrar();
                    if (onGuardado) onGuardado();
                }
            }
        ]
    });
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
 */
export function cambiarEstado(req, usuario, perfil, onCambiado) {
    const estados = ['Pendiente', 'En proceso', 'Cumplido'];
    const estadoActual = req.estado;

    let opcionesHTML = estados
        .filter(e => e !== estadoActual)
        .map(e => `<option value="${e}">${e}</option>`)
        .join('');

    const html = `
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

                    Toast.exito(`Estado cambiado a "${nuevoEstado}".`);
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
 * Helper: clase CSS del badge según estado
 */
function badgeClase(req) {
    if (req.eliminado) return 'badge-eliminado';
    const map = { 'Pendiente': 'badge-pendiente', 'En proceso': 'badge-en-proceso', 'Cumplido': 'badge-cumplido' };
    return map[req.estado] || '';
}

export { badgeClase };
