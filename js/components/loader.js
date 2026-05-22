/**
 * ============================================================
 * COMPONENTE: LOADER
 * ============================================================
 * Muestra un indicador de carga mientras se procesan datos.
 * 
 * Uso:
 *   import { Loader } from '../components/loader.js';
 *   Loader.mostrar('Cargando requisiciones...');
 *   Loader.ocultar();
 * ============================================================
 */

let loaderElemento = null;

/**
 * Muestra el loader a pantalla completa
 * @param {string} texto - Mensaje opcional (default: 'Cargando...')
 */
function mostrar(texto = 'Cargando...') {
    // Evitar duplicados
    if (loaderElemento) {
        const textoEl = loaderElemento.querySelector('.loader-texto');
        if (textoEl) textoEl.textContent = texto;
        return;
    }

    loaderElemento = document.createElement('div');
    loaderElemento.className = 'loader-overlay';
    loaderElemento.id = 'loader-global';
    loaderElemento.innerHTML = `
        <div class="loader-spinner"></div>
        <span class="loader-texto">${texto}</span>
    `;

    document.body.appendChild(loaderElemento);
}

/**
 * Oculta el loader
 */
function ocultar() {
    if (loaderElemento) {
        loaderElemento.remove();
        loaderElemento = null;
    }
}

// ─── API pública del componente ───
export const Loader = {
    mostrar,
    ocultar
};
