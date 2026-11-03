
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


export function formatearFecha(fecha) {
    if (!fecha) return '-';

    if (typeof fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
        const [a, m, d] = fecha.split('-');
        return `${d}/${m}/${a}`;
    }
    const d = new Date(fecha);
    return d.toLocaleDateString('es-CO', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
}


export function formatearFechaHora(fecha) {
    if (!fecha) return '-';
    if (typeof fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
        return formatearFecha(fecha);
    }
    const d = new Date(fecha);
    return d.toLocaleDateString('es-CO', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}


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


export function extraerValorNumerico(valorFormateado) {
    if (!valorFormateado) return 0;
    const limpio = valorFormateado.replace(/[^0-9]/g, '');
    return parseInt(limpio, 10) || 0;
}


export function fechaActualISO() {
    return new Date().toISOString().split('T')[0];
}
