
(function () {
    'use strict';

    var reducirMovimiento = window.matchMedia &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducirMovimiento) return;


    function animarContador(el, valorFinal) {
        var duracion = Math.min(1200, 400 + valorFinal * 8); 
        var inicio = null;

        el.dataset.eiAnimando = '1';
        el.classList.add('contando');

        function paso(timestamp) {
            if (!inicio) inicio = timestamp;
            var progreso = Math.min((timestamp - inicio) / duracion, 1);
            var eased = 1 - Math.pow(1 - progreso, 3);
            var valorActual = Math.round(eased * valorFinal);

            el.dataset.eiInterno = '1';
            el.textContent = String(valorActual);

            if (progreso < 1) {
                requestAnimationFrame(paso);
            } else {
                el.classList.remove('contando');
                delete el.dataset.eiAnimando;
            }
        }
        requestAnimationFrame(paso);
    }

    function observarMetrica(el) {
        var observador = new MutationObserver(function () {
            if (el.dataset.eiInterno === '1') {
                delete el.dataset.eiInterno;
                return;
            }
            if (el.dataset.eiAnimando === '1') return;

            var texto = (el.textContent || '').trim();
            if (/^\d+$/.test(texto)) {
                var valor = parseInt(texto, 10);
                if (valor > 0) animarContador(el, valor);
            }
        });

        observador.observe(el, { childList: true, characterData: true, subtree: true });
    }

    function inicializar() {
        var metricas = document.querySelectorAll('.dash-card-valor, .stat-numero');
        metricas.forEach(function (el) {
            observarMetrica(el);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', inicializar);
    } else {
        inicializar();
    }
})();
