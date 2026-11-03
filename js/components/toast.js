
const ICONOS = {
    exito: '✓',
    error: '✕',
    advertencia: '⚠',
    info: 'ℹ'
};

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

    setTimeout(() => {
        toast.classList.add('toast-salir');
        setTimeout(() => toast.remove(), 300);
    }, duracion);
}

export const Toast = {
    exito: (mensaje, duracion) => mostrar('exito', mensaje, duracion),
    error: (mensaje, duracion) => mostrar('error', mensaje, duracion),
    advertencia: (mensaje, duracion) => mostrar('advertencia', mensaje, duracion),
    info: (mensaje, duracion) => mostrar('info', mensaje, duracion)
};
