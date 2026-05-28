/**
 * ============================================================
 * MÓDULO: ACCIONES DE TIQUETES AÉREOS
 * ============================================================
 * Maneja aprobar, rechazar, reenviar, ver detalle, historial,
 * cambiar estado y permisos para tiquetes aéreos.
 * ============================================================
 */

import { actualizarTiquete, registrarHistorialTiquete, obtenerHistorialTiquete, obtenerUrlFirmada, subirArchivo } from '../services/tiquetes.service.js';
import { formatearFecha, formatearFechaHora } from '../utils/formatters.js';
import { Modal } from '../components/modal.js';
import { Toast } from '../components/toast.js';

/**
 * ─── PERMISOS ───
 */

export function puedeAprobarTiquete(tiq, perfil) {
    if (tiq.eliminado) return false;
    if (tiq.estado !== 'Pendiente aprobación') return false;
    return tiq.aprobador_id === perfil.id;
}

export function puedeEditarTiquete(tiq, perfil) {
    if (tiq.eliminado) return false;
    if (tiq.estado === 'Cumplido') return false;
    if (tiq.estado === 'Pendiente aprobación') return false;
    if (tiq.estado === 'Rechazada') return tiq.user_id === perfil.id;
    if (perfil.rol === 'super_admin') return true;
    if (perfil.rol === 'admin_compras') return true;
    if (tiq.user_id !== perfil.id) return false;
    return false; // Tiquetes siempre los gestiona Compras una vez aprobados
}

export function puedeCambiarEstadoTiquete(tiq, perfil) {
    if (tiq.eliminado) return false;
    if (tiq.estado === 'Cumplido') return false;
    if (tiq.estado === 'Pendiente aprobación') return false;
    if (tiq.estado === 'Rechazada') return false;
    if (perfil.rol === 'super_admin') return true;
    if (perfil.rol === 'admin_compras') return true;
    return false;
}

export function puedeReenviarTiquete(tiq, perfil) {
    return tiq.estado === 'Rechazada' && tiq.user_id === perfil.id;
}

export function puedeEliminarTiquete(tiq, perfil) {
    if (tiq.eliminado) return false;
    if (tiq.estado === 'Cumplido') return false;
    if (tiq.estado === 'Pendiente aprobación') return false;
    if (perfil.rol === 'super_admin') return true;
    if (tiq.user_id !== perfil.id) return false;
    return true;
}

/**
 * ─── APROBAR / RECHAZAR ───
 */
export async function aprobarTiquete(tiq, usuario, perfil, onProcesado) {
    // Pre-cargar URLs firmadas de las cédulas
    const urlFrente = await obtenerUrlFirmada(tiq.pasajero_cedula_frente_url);
    const urlReverso = await obtenerUrlFirmada(tiq.pasajero_cedula_reverso_url);

    const html = `
        <div style="display:grid;gap:1rem;">
            <div style="background:var(--color-azul-light);border-radius:var(--radio-md);padding:1rem;">
                <div style="font-size:var(--texto-xs);color:var(--color-azul);font-weight:600;margin-bottom:0.25rem;">TIQUETE</div>
                <div style="font-weight:600;color:var(--color-azul);font-size:var(--texto-base);">${tiq.id_tiquete}</div>
                <div style="font-size:var(--texto-sm);color:var(--color-texto);margin-top:0.5rem;">
                    <strong>${tiq.solicitante}</strong> solicita viaje a <strong>${tiq.destino}</strong>
                </div>
                <div style="font-size:var(--texto-xs);color:var(--color-texto-secundario);margin-top:0.5rem;">
                    Pasajero: <strong>${tiq.pasajero_nombre}</strong> (CC ${tiq.pasajero_cedula})
                    ${tiq.pasajero_es_solicitante ? '' : ' · <span style="color:#7C3AED;">El pasajero es un tercero</span>'}
                </div>
            </div>

            <div style="font-size:var(--texto-sm);display:grid;gap:0.4rem;">
                <div><strong>Actividad:</strong> ${tiq.actividad}</div>
                <div><strong>Ida:</strong> ${formatearFecha(tiq.fecha_ida)}${tiq.hora_ida ? ' a las ' + tiq.hora_ida : ''}</div>
                ${tiq.solo_ida ? '<div><strong>Tipo:</strong> Solo ida</div>' : `<div><strong>Regreso:</strong> ${formatearFecha(tiq.fecha_regreso)}${tiq.hora_regreso ? ' a las ' + tiq.hora_regreso : ''}${tiq.origen_regreso ? ' desde <strong>' + tiq.origen_regreso + '</strong>' : ''}</div>`}
                <div><strong>Hotel:</strong> ${tiq.requiere_hotel ? 'Sí — ' + (tiq.hotel_ciudad || tiq.destino) : 'No requiere'}</div>
                <div><strong>Unidad / CC:</strong> ${tiq.unidad_negocio} / ${tiq.centro_costo}</div>
                ${tiq.observaciones ? `<div><strong>Observaciones:</strong> ${tiq.observaciones}</div>` : ''}
            </div>

            <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
                ${urlFrente ? `<a href="${urlFrente}" target="_blank" class="btn btn-secundario" style="font-size:var(--texto-xs);">Ver cédula frente</a>` : ''}
                ${urlReverso ? `<a href="${urlReverso}" target="_blank" class="btn btn-secundario" style="font-size:var(--texto-xs);">Ver cédula reverso</a>` : ''}
            </div>

            <div class="input-grupo">
                <label class="input-label">Motivo (obligatorio solo si rechaza)</label>
                <textarea id="motivo-aprob-tiq" class="input-campo input-textarea" placeholder="Comentario para el solicitante..."></textarea>
            </div>
        </div>
    `;

    Modal.crear({
        titulo: `Aprobar tiquete - ${tiq.id_tiquete}`,
        contenido: html,
        ancho: '600px',
        botones: [
            { texto: 'Cancelar', clase: 'btn-secundario', onClick: Modal.cerrar },
            { texto: 'Rechazar', clase: 'btn-peligro', onClick: async () => {
                const motivo = document.getElementById('motivo-aprob-tiq').value.trim();
                if (!motivo) { Toast.advertencia('Debe ingresar el motivo del rechazo.'); return; }

                const { error } = await actualizarTiquete(tiq.id, {
                    estado: 'Rechazada',
                    motivo_rechazo: motivo,
                    fecha_aprobacion: new Date().toISOString()
                });
                if (error) { Toast.error(error); return; }

                await registrarHistorialTiquete({
                    tiquete_id: tiq.id,
                    id_tiquete: tiq.id_tiquete,
                    user_id: usuario.id,
                    nombre_usuario: perfil.nombre_completo,
                    accion: 'rechazo',
                    campo_modificado: 'estado',
                    valor_anterior: 'Pendiente aprobación',
                    valor_nuevo: 'Rechazada',
                    detalle: `Rechazado: ${motivo}`
                });

                Toast.exito('Tiquete rechazado. El solicitante podrá editarlo y reenviarlo.');
                Modal.cerrar();
                if (onProcesado) onProcesado();
            }},
            { texto: '✓ Aprobar', clase: 'btn-primario', onClick: async () => {
                const motivo = document.getElementById('motivo-aprob-tiq').value.trim();

                const { error } = await actualizarTiquete(tiq.id, {
                    estado: 'Pendiente',
                    fecha_aprobacion: new Date().toISOString(),
                    motivo_rechazo: null
                });
                if (error) { Toast.error(error); return; }

                await registrarHistorialTiquete({
                    tiquete_id: tiq.id,
                    id_tiquete: tiq.id_tiquete,
                    user_id: usuario.id,
                    nombre_usuario: perfil.nombre_completo,
                    accion: 'aprobacion',
                    campo_modificado: 'estado',
                    valor_anterior: 'Pendiente aprobación',
                    valor_nuevo: 'Pendiente',
                    detalle: motivo ? `Aprobado: ${motivo}` : 'Aprobado para gestión de Compras'
                });

                Toast.exito('Tiquete aprobado. Pasa al área de Compras.');
                Modal.cerrar();
                if (onProcesado) onProcesado();
            }}
        ]
    });
}

/**
 * ─── REENVIAR (rechazado → pendiente aprobación) ───
 */
export function reenviarTiquete(tiq, usuario, perfil, onReenviado) {
    Modal.crear({
        titulo: 'Reenviar a aprobación',
        contenido: `<p>¿Desea reenviar el tiquete <strong>${tiq.id_tiquete}</strong> a aprobación? Asegúrese de haber editado los campos necesarios.</p>`,
        botones: [
            { texto: 'Cancelar', clase: 'btn-secundario', onClick: Modal.cerrar },
            { texto: 'Reenviar', clase: 'btn-primario', onClick: async () => {
                const { error } = await actualizarTiquete(tiq.id, {
                    estado: 'Pendiente aprobación',
                    motivo_rechazo: null,
                    fecha_aprobacion: null
                });
                if (error) { Toast.error(error); return; }

                await registrarHistorialTiquete({
                    tiquete_id: tiq.id,
                    id_tiquete: tiq.id_tiquete,
                    user_id: usuario.id,
                    nombre_usuario: perfil.nombre_completo,
                    accion: 'reenvio',
                    campo_modificado: 'estado',
                    valor_anterior: 'Rechazada',
                    valor_nuevo: 'Pendiente aprobación',
                    detalle: 'Reenviado a aprobación tras correcciones'
                });

                Toast.exito('Tiquete reenviado a aprobación.');
                Modal.cerrar();
                if (onReenviado) onReenviado();
            }}
        ]
    });
}

/**
 * ─── INICIAR GESTIÓN (Pendiente → En gestión) ───
 * Solo admin_compras puede usar esto.
 */
export function iniciarGestionTiquete(tiq, usuario, perfil, onCambiado) {
    Modal.crear({
        titulo: 'Iniciar gestión del tiquete',
        contenido: `<p>¿Confirmas que vas a empezar a gestionar el tiquete <strong>${tiq.id_tiquete}</strong>? El solicitante verá que ya está en proceso.</p>`,
        botones: [
            { texto: 'Cancelar', clase: 'btn-secundario', onClick: Modal.cerrar },
            { texto: 'Iniciar gestión', clase: 'btn-primario', onClick: async () => {
                const { error } = await actualizarTiquete(tiq.id, { estado: 'En gestión' });
                if (error) { Toast.error(error); return; }

                await registrarHistorialTiquete({
                    tiquete_id: tiq.id,
                    id_tiquete: tiq.id_tiquete,
                    user_id: usuario.id,
                    nombre_usuario: perfil.nombre_completo,
                    accion: 'cambio_estado',
                    campo_modificado: 'estado',
                    valor_anterior: 'Pendiente',
                    valor_nuevo: 'En gestión',
                    detalle: 'Compras inició la gestión del tiquete'
                });

                Toast.exito('Tiquete en gestión.');
                Modal.cerrar();
                if (onCambiado) onCambiado();
            }}
        ]
    });
}

/**
 * ─── CUMPLIR TIQUETE (sube PDFs, código y envía correo al solicitante) ───
 */
export async function cumplirTiquete(tiq, usuario, perfil, onCumplido) {
    const html = `
        <div style="display:grid;gap:1rem;">
            <div style="background:#D1FAE5;border-left:4px solid #10B981;padding:0.875rem;border-radius:6px;">
                <div style="font-size:var(--texto-xs);color:#065F46;font-weight:600;margin-bottom:0.25rem;">TIQUETE A CUMPLIR</div>
                <div style="font-weight:600;color:#065F46;">${tiq.id_tiquete} — ${tiq.destino}</div>
                <div style="font-size:var(--texto-xs);color:#1F2937;margin-top:0.25rem;">
                    Pasajero: ${tiq.pasajero_nombre}${tiq.requiere_hotel ? ' · Con hotel' : ''}
                </div>
            </div>

            <div class="input-grupo">
                <label class="input-label">Código de reserva (PNR) <span class="requerido">*</span></label>
                <input type="text" id="cumplir-codigo" class="input-campo" placeholder="Ej: ABC123, XYZ456" style="text-transform:uppercase;font-family:'Courier New',monospace;letter-spacing:1px;">
            </div>

            <div class="input-grupo">
                <label class="input-label">PDF del tiquete aéreo <span class="requerido">*</span></label>
                <label class="upload-area" id="up-tiquete-pdf">
                    <input type="file" id="file-tiquete-pdf" accept="application/pdf,image/*" style="display:none;">
                    <div class="upload-icono">📄</div>
                    <div class="upload-texto">Click para subir PDF del tiquete</div>
                    <div class="upload-nombre" id="nombre-tiquete-pdf"></div>
                </label>
            </div>

            ${tiq.requiere_hotel ? `
            <div class="input-grupo">
                <label class="input-label">Confirmación del hotel (PDF) <span class="requerido">*</span></label>
                <label class="upload-area" id="up-hotel-pdf">
                    <input type="file" id="file-hotel-pdf" accept="application/pdf,image/*" style="display:none;">
                    <div class="upload-icono">🏨</div>
                    <div class="upload-texto">Click para subir confirmación del hotel</div>
                    <div class="upload-nombre" id="nombre-hotel-pdf"></div>
                </label>
            </div>` : ''}

            <div class="input-grupo">
                <label class="input-label">Observaciones para el solicitante (opcional)</label>
                <textarea id="cumplir-observaciones" class="input-campo input-textarea" placeholder="Detalles sobre la aerolínea, escalas, notas importantes..."></textarea>
            </div>
        </div>
    `;

    Modal.crear({
        titulo: `Cumplir tiquete - ${tiq.id_tiquete}`,
        contenido: html,
        ancho: '600px',
        botones: [
            { texto: 'Cancelar', clase: 'btn-secundario', onClick: Modal.cerrar },
            { texto: '✓ Marcar como Cumplido', clase: 'btn-primario', onClick: async () => {
                const codigo = document.getElementById('cumplir-codigo').value.trim().toUpperCase();
                const observaciones = document.getElementById('cumplir-observaciones').value.trim();
                const fileTiquete = document.getElementById('file-tiquete-pdf').files[0];
                const fileHotel = tiq.requiere_hotel ? document.getElementById('file-hotel-pdf').files[0] : null;

                if (!codigo) { Toast.advertencia('Ingrese el código de reserva.'); return; }
                if (!fileTiquete) { Toast.advertencia('Suba el PDF del tiquete.'); return; }
                if (tiq.requiere_hotel && !fileHotel) { Toast.advertencia('Suba la confirmación del hotel.'); return; }

                const btn = event.target;
                btn.disabled = true;
                btn.textContent = 'Subiendo archivos...';

                try {
                    // Subir PDF del tiquete
                    const upTiquete = await subirArchivo(fileTiquete, 'tiquetes', `${tiq.id_tiquete}_tiquete`);
                    if (upTiquete.error) { Toast.error('Error subiendo tiquete: ' + upTiquete.error); btn.disabled = false; btn.textContent = '✓ Marcar como Cumplido'; return; }

                    let upHotel = { path: null };
                    if (tiq.requiere_hotel && fileHotel) {
                        upHotel = await subirArchivo(fileHotel, 'hoteles', `${tiq.id_tiquete}_hotel`);
                        if (upHotel.error) { Toast.error('Error subiendo hotel: ' + upHotel.error); btn.disabled = false; btn.textContent = '✓ Marcar como Cumplido'; return; }
                    }

                    btn.textContent = 'Guardando...';

                    // Actualizar el tiquete
                    const cambios = {
                        estado: 'Cumplido',
                        codigo_reserva: codigo,
                        tiquete_pdf_url: upTiquete.path,
                        hotel_confirmacion_url: upHotel.path,
                        fecha_entrega: new Date().toISOString(),
                        entregado_por: usuario.id
                    };

                    const { error } = await actualizarTiquete(tiq.id, cambios);
                    if (error) { Toast.error(error); btn.disabled = false; btn.textContent = '✓ Marcar como Cumplido'; return; }

                    // Registrar en historial
                    await registrarHistorialTiquete({
                        tiquete_id: tiq.id,
                        id_tiquete: tiq.id_tiquete,
                        user_id: usuario.id,
                        nombre_usuario: perfil.nombre_completo,
                        accion: 'cumplimiento',
                        campo_modificado: 'estado',
                        valor_anterior: tiq.estado,
                        valor_nuevo: 'Cumplido',
                        detalle: `Tiquete cumplido. Código: ${codigo}${observaciones ? ' · Notas: ' + observaciones : ''}`
                    });

                    btn.textContent = 'Enviando correo al solicitante...';

                    // Enviar correo al solicitante (sin bloquear si falla)
                    fetch('/api/notificar-tiquete-cumplido', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            id_tiquete: tiq.id_tiquete,
                            user_id: tiq.user_id,
                            solicitante: tiq.solicitante,
                            pasajero_nombre: tiq.pasajero_nombre,
                            pasajero_cedula: tiq.pasajero_cedula,
                            destino: tiq.destino,
                            fecha_ida: tiq.fecha_ida,
                            hora_ida: tiq.hora_ida,
                            fecha_regreso: tiq.fecha_regreso,
                            hora_regreso: tiq.hora_regreso,
                            origen_regreso: tiq.origen_regreso,
                            solo_ida: tiq.solo_ida,
                            requiere_hotel: tiq.requiere_hotel,
                            hotel_ciudad: tiq.hotel_ciudad,
                            hotel_fecha_checkin: tiq.hotel_fecha_checkin,
                            hotel_fecha_checkout: tiq.hotel_fecha_checkout,
                            codigo_reserva: codigo,
                            tiquete_pdf_path: upTiquete.path,
                            hotel_confirmacion_path: upHotel.path,
                            observaciones_entrega: observaciones
                        })
                    }).catch(err => console.error('Error correo tiquete cumplido:', err));

                    Toast.exito('Tiquete cumplido. Se envió un correo al solicitante.');
                    Modal.cerrar();
                    if (onCumplido) onCumplido();
                } catch (err) {
                    console.error(err);
                    Toast.error('Error al cumplir el tiquete.');
                    btn.disabled = false;
                    btn.textContent = '✓ Marcar como Cumplido';
                }
            }}
        ]
    });

    // Configurar feedback visual de los uploads (después de que el modal esté en el DOM)
    setTimeout(() => {
        ['tiquete-pdf', 'hotel-pdf'].forEach(id => {
            const input = document.getElementById(`file-${id}`);
            if (!input) return;
            input.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    document.getElementById(`up-${id}`).classList.add('tiene-archivo');
                    document.getElementById(`nombre-${id}`).textContent = '✓ ' + file.name;
                }
            });
        });
    }, 100);
}

/**
 * ─── PUEDE INICIAR GESTIÓN / CUMPLIR (solo admin_compras y super_admin) ───
 */
export function puedeIniciarGestion(tiq, perfil) {
    if (tiq.eliminado || tiq.estado !== 'Pendiente') return false;
    return perfil.rol === 'admin_compras' || perfil.rol === 'super_admin';
}

export function puedeCumplir(tiq, perfil) {
    if (tiq.eliminado) return false;
    if (tiq.estado !== 'Pendiente' && tiq.estado !== 'En gestión') return false;
    return perfil.rol === 'admin_compras' || perfil.rol === 'super_admin';
}

/**
 * ─── BADGE CLASS HELPER ───
 */
export function badgeClaseTiquete(tiq) {
    const map = {
        'Pendiente aprobación': 'badge-tiq-pendiente-aprob',
        'Rechazada': 'badge-tiq-rechazada',
        'Pendiente': 'badge-tiq-pendiente',
        'En gestión': 'badge-tiq-gestion',
        'Cumplido': 'badge-tiq-cumplido'
    };
    return map[tiq.estado] || '';
}
