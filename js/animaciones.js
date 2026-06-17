/**
 * ============================================================
 * ANIMACIONES DE INTERFAZ
 * Electroingeniería S.A.S.
 * ============================================================
 * Capa visual 100% aditiva. No modifica datos ni lógica:
 * solo observa los valores que el sistema escribe en pantalla
 * y los anima (efecto "contador que sube").
 * ============================================================
 */

(function () {
    'use strict';

    // Respetar preferencia del usuario de reducir movimiento
    var reducirMovimiento = window.matchMedia &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducirMovimiento) return;

    /**
     * Anima un número desde 0 hasta su valor final.
     * @param {HTMLElement} el - Elemento que contiene el número
     * @param {number} valorFinal - Valor destino
     */
    function animarContador(el, valorFinal) {
        var duracion = Math.min(1200, 400 + valorFinal * 8); // más rápido si el número es pequeño
        var inicio = null;

        el.dataset.eiAnimando = '1';
        el.classList.add('contando');

        function paso(timestamp) {
            if (!inicio) inicio = timestamp;
            var progreso = Math.min((timestamp - inicio) / duracion, 1);
            // Easing suave (easeOutCubic)
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

    /**
     * Observa un elemento de métrica: cuando el sistema escribe
     * un número entero, lo reemplaza por una animación de conteo.
     */
    function observarMetrica(el) {
        var observador = new MutationObserver(function () {
            // Ignorar los cambios que genera la propia animación
            if (el.dataset.eiInterno === '1') {
                delete el.dataset.eiInterno;
                return;
            }
            if (el.dataset.eiAnimando === '1') return;

            var texto = (el.textContent || '').trim();
            // Solo animar valores enteros puros (no monedas ni "- días")
            if (/^\d+$/.test(texto)) {
                var valor = parseInt(texto, 10);
                if (valor > 0) animarContador(el, valor);
            }
        });

        observador.observe(el, { childList: true, characterData: true, subtree: true });
    }

    function inicializar() {
        // Métricas numéricas del dashboard y paneles admin
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
