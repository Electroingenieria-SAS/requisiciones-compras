

let loaderElemento = null;


function mostrar(texto = 'Cargando...') {
   
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

function ocultar() {
    if (loaderElemento) {
        loaderElemento.remove();
        loaderElemento = null;
    }
}

export const Loader = {
    mostrar,
    ocultar
};
