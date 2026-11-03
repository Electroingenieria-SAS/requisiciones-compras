
function crear({ titulo, contenido, botones = [], ancho = '600px' }) {
 
    cerrar();

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'modal-activo';

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
    document.getElementById('modal-cerrar-btn').addEventListener('click', cerrar);

  
    botones.forEach((b, i) => {
        const btn = overlay.querySelector(`[data-btn-index="${i}"]`);
        if (btn && b.onClick) {
            btn.addEventListener('click', b.onClick);
        }
    });

   
    const handleEscape = (e) => {
        if (e.key === 'Escape') {
            cerrar();
            document.removeEventListener('keydown', handleEscape);
        }
    };
    document.addEventListener('keydown', handleEscape);

    return overlay;
}


function cerrar() {
    const modal = document.getElementById('modal-activo');
    if (modal) modal.remove();
}

export const Modal = { crear, cerrar };
