/**
 * ============================================================
 * MÓDULO: ACCIONES DE TIQUETES AÉREOS
 * ============================================================
 * Maneja aprobar, rechazar, reenviar, ver detalle, historial,
 * cambiar estado y permisos para tiquetes aéreos.
 * ============================================================
 */

import { actualizarTiquete, registrarHistorialTiquete, obtenerHistorialTiquete, obtenerUrlFirmada } from '../services/tiquetes.service.js';
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
