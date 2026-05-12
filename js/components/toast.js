/**
 * ============================================================
 * COMPONENTE: TOAST NOTIFICATIONS
 * ============================================================
 * Muestra mensajes temporales al usuario (éxito, error, etc.)
 * 
 * Uso:
 *   import { Toast } from '../components/toast.js';
 *   Toast.exito('Requisición creada correctamente');
 *   Toast.error('No se pudo guardar');
 *   Toast.advertencia('Campos incompletos');
 *   Toast.info('Procesando...');
 * ============================================================
 */

// Iconos simples en texto para cada tipo de toast
const ICONOS = {
    exito: '✓',
    error: '✕',
    advertencia: '⚠',
    info: 'ℹ'
};

/**
 * Crea el contenedor de toasts si no existe
 */
function obtenerContenedor() {
    let contenedor = document.getElementById('toast-contenedor');
    if (!contenedor) {
        contenedor = document.createElement('div');
        contenedor.id = 'toast-contenedor';
        contenedor.className = 'toast-contenedor';
        document.body.appendChild(contenedor);
    }
    return contenedor;
}

/**
 * Muestra un toast con el tipo y mensaje indicado
 * @param {string} tipo - exito, error, advertencia, info
 * @param {string} mensaje - Texto a mostrar
 * @param {number} duracion - Milisegundos antes de desaparecer (default: 4000)
 */
function mostrar(tipo, mensaje, duracion = 4000) {
    const contenedor = obtenerContenedor();

    const toast = document.createElement('div');
    toast.className = `toast toast-${tipo}`;
    toast.innerHTML = `
        <span class="toast-icono">${ICONOS[tipo]}</span>
        <span class="toast-mensaje">${mensaje}</span>
        <button class="toast-cerrar" onclick="this.parentElement.remove()">✕</button>
    `;

    contenedor.appendChild(toast);

    // Auto-eliminar después de la duración
    setTimeout(() => {
        toast.classList.add('toast-salir');
        setTimeout(() => toast.remove(), 300);
    }, duracion);
}

// ─── API pública del componente ───
export const Toast = {
    exito: (mensaje, duracion) => mostrar('exito', mensaje, duracion),
    error: (mensaje, duracion) => mostrar('error', mensaje, duracion),
    advertencia: (mensaje, duracion) => mostrar('advertencia', mensaje, duracion),
    info: (mensaje, duracion) => mostrar('info', mensaje, duracion)
};
