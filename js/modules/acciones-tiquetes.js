/**
 * ============================================================
 * MÓDULO: ACCIONES DE TIQUETES AÉREOS
 * ============================================================
 * Maneja aprobar, rechazar, reenviar, ver detalle, historial,
 * cambiar estado y permisos para tiquetes aéreos.
 * ============================================================
 */

import { actualizarTiquete, registrarHistorialTiquete, obtenerHistorialTiquete, obtenerUrlFirmada, subirArchivo } from '../services/tiquetes.service.js';
import { crearReserva, subirPdfReserva } from '../services/tiquete-reservas.service.js';
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
    // Pre-cargar URLs firmadas de las cédulas (retrocompatible: tiquetes viejos tienen frente+reverso, nuevos solo un archivo)
    const urlFrente = await obtenerUrlFirmada(tiq.pasajero_cedula_frente_url);
    const urlReverso = tiq.pasajero_cedula_reverso_url ? await obtenerUrlFirmada(tiq.pasajero_cedula_reverso_url) : null;
    // Si hay reverso → registro viejo (mostrar 2 botones). Si no → registro nuevo (1 botón).
    const botonesCedula = urlReverso
        ? `${urlFrente ? `<a href="${urlFrente}" target="_blank" class="btn btn-secundario" style="font-size:var(--texto-xs);">Ver cédula frente</a>` : ''}
           <a href="${urlReverso}" target="_blank" class="btn btn-secundario" style="font-size:var(--texto-xs);">Ver cédula reverso</a>`
        : `${urlFrente ? `<a href="${urlFrente}" target="_blank" class="btn btn-secundario" style="font-size:var(--texto-xs);">Ver cédula</a>` : ''}`;

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
                ${botonesCedula}
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
 * ─── CUMPLIR TIQUETE (varias reservas: cada una con código, PDF y observación) ───
 *
 * Compras puede haber hecho varias compras separadas para el mismo viaje
 * (ej: 2 pasajeros en una reserva, 1 pasajero en otra). Por eso permitimos
 * registrar N reservas, cada una con su propio PDF y observación libre.
 */
export async function cumplirTiquete(tiq, usuario, perfil, onCumplido) {
    // Estado compartido de reservas (accesible tanto en el guardado como en el render)
    let reservasTemp = [{ codigo: '', archivo: null, observ: '' }];

    const html = `
        <div style="display:grid;gap:1rem;">
            <div style="background:#D1FAE5;border-left:4px solid #10B981;padding:0.875rem;border-radius:6px;">
                <div style="font-size:var(--texto-xs);color:#065F46;font-weight:600;margin-bottom:0.25rem;">TIQUETE A CUMPLIR</div>
                <div style="font-weight:600;color:#065F46;">${tiq.id_tiquete} — ${tiq.destino}</div>
                <div style="font-size:var(--texto-xs);color:#1F2937;margin-top:0.25rem;">
                    Pasajero principal: ${tiq.pasajero_nombre}${tiq.requiere_hotel ? ' · Con hotel' : ''}
                </div>
            </div>

            <!-- Repetidor de reservas -->
            <div>
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem;">
                    <label class="input-label" style="margin:0;">Reservas adquiridas <span class="requerido">*</span></label>
                    <button type="button" id="btn-add-reserva" class="btn btn-secundario" style="font-size:var(--texto-xs);padding:0.35rem 0.75rem;">+ Agregar otra reserva</button>
                </div>
                <div style="font-size:var(--texto-xs);color:var(--color-texto-secundario);margin-bottom:0.5rem;">
                    Si la compra cubrió varios pasajeros con códigos PNR distintos, agrega cada reserva por separado con su PDF.
                </div>
                <div id="lista-reservas"></div>
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
                <label class="input-label">Observaciones generales (opcional)</label>
                <textarea id="cumplir-observaciones" class="input-campo input-textarea" placeholder="Notas globales para el solicitante..."></textarea>
            </div>
        </div>
    `;

    Modal.crear({
        titulo: `Cumplir tiquete - ${tiq.id_tiquete}`,
        contenido: html,
        ancho: '640px',
        botones: [
            { texto: 'Cancelar', clase: 'btn-secundario', onClick: Modal.cerrar },
            { texto: '✓ Marcar como Cumplido', clase: 'btn-primario', onClick: async () => {
                // Leer desde el estado interno (reservasTemp), NO del DOM.
                // Al redibujar la lista, el <input type="file"> se recrea vacío por
                // seguridad del navegador, pero el archivo sí queda guardado aquí.
                const codigos = reservasTemp.map(r => (r.codigo || '').trim().toUpperCase());
                const archivos = reservasTemp.map(r => r.archivo || null);
                const observ = reservasTemp.map(r => (r.observ || '').trim());

                if (codigos.length === 0) { Toast.advertencia('Agregue al menos una reserva.'); return; }
                for (let i = 0; i < codigos.length; i++) {
                    if (!codigos[i]) { Toast.advertencia(`Falta el código de la reserva #${i + 1}.`); return; }
                    if (!archivos[i]) { Toast.advertencia(`Falta el PDF de la reserva #${i + 1}.`); return; }
                }

                const observacionesGen = document.getElementById('cumplir-observaciones').value.trim();
                const fileHotel = tiq.requiere_hotel ? document.getElementById('file-hotel-pdf').files[0] : null;
                if (tiq.requiere_hotel && !fileHotel) { Toast.advertencia('Suba la confirmación del hotel.'); return; }

                const btn = event.target;
                btn.disabled = true;
                btn.textContent = 'Subiendo archivos...';

                try {
                    // Subir hotel (si aplica)
                    let upHotel = { path: null };
                    if (tiq.requiere_hotel && fileHotel) {
                        upHotel = await subirArchivo(fileHotel, 'hoteles', `${tiq.id_tiquete}_hotel`);
                        if (upHotel.error) { throw new Error('Hotel: ' + upHotel.error); }
                    }

                    // Subir PDF de cada reserva y guardar en tiquete_reservas
                    btn.textContent = `Guardando reservas (0/${codigos.length})...`;
                    for (let i = 0; i < codigos.length; i++) {
                        btn.textContent = `Subiendo PDF (${i + 1}/${codigos.length})...`;
                        const up = await subirPdfReserva(archivos[i], tiq.id_tiquete, i + 1);
                        if (up.error) { throw new Error(`Reserva #${i + 1}: ${up.error}`); }

                        const { error: errReserva } = await crearReserva({
                            tiquete_id: tiq.id,
                            codigo_reserva: codigos[i],
                            tiquete_pdf_url: up.path,
                            observacion: observ[i] || '',
                            creado_por: usuario.id,
                            creado_por_nombre: perfil.nombre_completo
                        });
                        if (errReserva) { throw new Error(`Reserva #${i + 1}: ${errReserva}`); }
                    }

                    btn.textContent = 'Finalizando...';

                    // Actualizar tiquete: estado Cumplido + primera reserva en columnas legacy (compat)
                    const cambios = {
                        estado: 'Cumplido',
                        codigo_reserva: codigos[0],
                        hotel_confirmacion_url: upHotel.path,
                        fecha_entrega: new Date().toISOString(),
                        entregado_por: usuario.id
                    };
                    const { error } = await actualizarTiquete(tiq.id, cambios);
                    if (error) { throw new Error(error); }

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
                        detalle: `Tiquete cumplido con ${codigos.length} reserva(s): ${codigos.join(', ')}${observacionesGen ? ' · Notas: ' + observacionesGen : ''}`
                    });

                    Toast.exito(`Tiquete cumplido con ${codigos.length} reserva(s).`);
                    Modal.cerrar();
                    if (onCumplido) onCumplido();
                } catch (err) {
                    console.error(err);
                    Toast.error('Error: ' + (err.message || 'No se pudo cumplir el tiquete.'));
                    btn.disabled = false;
                    btn.textContent = '✓ Marcar como Cumplido';
                }
            }}
        ]
    });

    // ─── Render del formulario de reservas (usa el reservasTemp del scope superior) ───
    setTimeout(() => {

        function renderReservas() {
            const cont = document.getElementById('lista-reservas');
            cont.innerHTML = reservasTemp.map((r, i) => `
                <div class="reserva-bloque" style="border:1.5px solid var(--color-borde);border-radius:8px;padding:0.85rem;margin-bottom:0.6rem;background:#FAFBFC;position:relative;animation:ei-entrada-arriba 0.35s ease both;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem;">
                        <strong style="color:var(--color-azul);font-size:var(--texto-sm);">Reserva #${i + 1}</strong>
                        ${reservasTemp.length > 1 ? `<button type="button" class="btn-quitar-reserva" data-i="${i}" style="background:none;border:none;color:var(--color-error);cursor:pointer;font-weight:600;font-size:var(--texto-xs);">✕ Quitar</button>` : ''}
                    </div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.6rem;">
                        <div class="input-grupo" style="margin:0;">
                            <label class="input-label" style="font-size:var(--texto-xs);">Código de reserva (PNR) <span class="requerido">*</span></label>
                            <input type="text" class="input-campo input-reserva-codigo" data-i="${i}" value="${r.codigo}" placeholder="Ej: ABC123" style="text-transform:uppercase;font-family:'Courier New',monospace;letter-spacing:1px;">
                        </div>
                        <div class="input-grupo" style="margin:0;">
                            <label class="input-label" style="font-size:var(--texto-xs);">PDF del tiquete <span class="requerido">*</span></label>
                            <input type="file" class="input-reserva-archivo" data-i="${i}" accept="application/pdf,image/*">
                            ${r.archivo ? `<div style="font-size:var(--texto-xs);color:var(--color-cumplido);margin-top:0.25rem;">✓ ${r.archivo.name}</div>` : ''}
                        </div>
                    </div>
                    <div class="input-grupo" style="margin:0.5rem 0 0;">
                        <label class="input-label" style="font-size:var(--texto-xs);">Observación (opcional)</label>
                        <input type="text" class="input-campo input-reserva-observ" data-i="${i}" value="${r.observ}" placeholder="Ej: Pasajeros 1 y 2 · Vuelo directo">
                    </div>
                </div>
            `).join('');

            // Listeners de inputs
            cont.querySelectorAll('.input-reserva-codigo').forEach(inp => {
                inp.addEventListener('input', (e) => {
                    reservasTemp[parseInt(e.target.dataset.i)].codigo = e.target.value;
                });
            });
            cont.querySelectorAll('.input-reserva-observ').forEach(inp => {
                inp.addEventListener('input', (e) => {
                    reservasTemp[parseInt(e.target.dataset.i)].observ = e.target.value;
                });
            });
            cont.querySelectorAll('.input-reserva-archivo').forEach(inp => {
                inp.addEventListener('change', (e) => {
                    const i = parseInt(e.target.dataset.i);
                    const file = e.target.files[0];
                    if (file) {
                        reservasTemp[i].archivo = file;
                        renderReservas();
                    }
                });
            });
            cont.querySelectorAll('.btn-quitar-reserva').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    reservasTemp.splice(parseInt(e.currentTarget.dataset.i), 1);
                    renderReservas();
                });
            });
        }

        document.getElementById('btn-add-reserva').addEventListener('click', () => {
            if (reservasTemp.length >= 9) {
                Toast.advertencia('Máximo 9 reservas por tiquete.');
                return;
            }
            reservasTemp.push({ codigo: '', archivo: null, observ: '' });
            renderReservas();
        });

        // Listener del hotel
        const inputHotel = document.getElementById('file-hotel-pdf');
        if (inputHotel) {
            inputHotel.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    document.getElementById('up-hotel-pdf').classList.add('tiene-archivo');
                    document.getElementById('nombre-hotel-pdf').textContent = '✓ ' + file.name;
                }
            });
        }

        renderReservas();
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
