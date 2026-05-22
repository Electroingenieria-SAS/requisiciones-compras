/**
 * ============================================================
 * COMPONENTE: MODAL
 * ============================================================
 * Modal reutilizable para detalle, edición, eliminación, etc.
 * 
 * Uso:
 *   import { Modal } from '../components/modal.js';
 *   const modal = Modal.crear({ titulo: 'Detalle', contenido: html, botones: [...] });
 *   Modal.cerrar();
 * ============================================================
 */

/**
 * Crear y mostrar un modal
 * @param {Object} opciones
 * @param {string} opciones.titulo - Título del modal
 * @param {string} opciones.contenido - HTML del body
 * @param {Array} opciones.botones - [{texto, clase, onClick}]
 * @param {string} opciones.ancho - Ancho máximo (default: '600px')
 * @returns {HTMLElement} Elemento del modal
 */
function crear({ titulo, contenido, botones = [], ancho = '600px' }) {
    // Cerrar modal anterior si existe
    cerrar();

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'modal-activo';

    // Cerrar al hacer clic fuera
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) cerrar();
    });

    let botonesHTML = '';
    if (botones.length > 0) {
        botonesHTML = `<div class="modal-footer">
            ${botones.map((b, i) => `<button class="btn ${b.clase || 'btn-secundario'}" data-btn-index="${i}">${b.texto}</button>`).join('')}
        </div>`;
    }

    overlay.innerHTML = `
        <div class="modal-contenido" style="max-width: ${ancho};">
            <div class="modal-header">
                <h3 class="modal-titulo">${titulo}</h3>
                <button class="modal-cerrar" id="modal-cerrar-btn">&times;</button>
            </div>
            <div class="modal-body">
                ${contenido}
            </div>
            ${botonesHTML}
        </div>
    `;

    document.body.appendChild(overlay);

    // Evento cerrar
    document.getElementById('modal-cerrar-btn').addEventListener('click', cerrar);

    // Eventos botones
    botones.forEach((b, i) => {
        const btn = overlay.querySelector(`[data-btn-index="${i}"]`);
        if (btn && b.onClick) {
            btn.addEventListener('click', b.onClick);
        }
    });

    // Cerrar con Escape
    const handleEscape = (e) => {
        if (e.key === 'Escape') {
            cerrar();
            document.removeEventListener('keydown', handleEscape);
        }
    };
    document.addEventListener('keydown', handleEscape);

    return overlay;
}

/**
 * Cerrar el modal activo
 */
function cerrar() {
    const modal = document.getElementById('modal-activo');
    if (modal) modal.remove();
}

export const Modal = { crear, cerrar };
