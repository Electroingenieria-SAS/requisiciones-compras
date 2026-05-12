/**
 * ============================================================
 * UTILIDADES: FORMATTERS
 * ============================================================
 * Funciones para formatear moneda colombiana, fechas, etc.
 * ============================================================
 */

/**
 * Formatea un número como pesos colombianos
 * Ejemplo: 1000000 → "$1.000.000"
 * @param {number|string} valor
 * @returns {string}
 */
export function formatearMoneda(valor) {
    if (!valor && valor !== 0) return '';
    const numero = typeof valor === 'string' ? parseFloat(valor.replace(/[^0-9.-]/g, '')) : valor;
    if (isNaN(numero)) return '';
    return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(numero);
}

/**
 * Formatea una fecha para mostrar en la interfaz
 * Ejemplo: "2026-05-12T01:22:14" → "12/05/2026"
 * @param {string|Date} fecha
 * @returns {string}
 */
export function formatearFecha(fecha) {
    if (!fecha) return '-';
    const d = new Date(fecha);
    return d.toLocaleDateString('es-CO', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
}

/**
 * Formatea fecha y hora
 * Ejemplo: "2026-05-12T01:22:14" → "12/05/2026 01:22"
 * @param {string|Date} fecha
 * @returns {string}
 */
export function formatearFechaHora(fecha) {
    if (!fecha) return '-';
    const d = new Date(fecha);
    return d.toLocaleDateString('es-CO', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

/**
 * Aplica formato monetario en tiempo real a un input
 * Se usa con addEventListener('input', ...)
 * @param {HTMLInputElement} input
 */
export function aplicarFormatoMonedaInput(input) {
    input.addEventListener('input', (e) => {
        let valor = e.target.value.replace(/[^0-9]/g, '');
        if (valor === '') {
            e.target.value = '';
            return;
        }
        const numero = parseInt(valor, 10);
        e.target.value = numero.toLocaleString('es-CO');
    });
}

/**
 * Extrae el valor numérico de un input con formato monetario
 * Ejemplo: "1.000.000" → 1000000
 * @param {string} valorFormateado
 * @returns {number}
 */
export function extraerValorNumerico(valorFormateado) {
    if (!valorFormateado) return 0;
    const limpio = valorFormateado.replace(/[^0-9]/g, '');
    return parseInt(limpio, 10) || 0;
}

/**
 * Obtiene la fecha actual en formato ISO (solo fecha)
 * @returns {string} "2026-05-12"
 */
export function fechaActualISO() {
    return new Date().toISOString().split('T')[0];
}
