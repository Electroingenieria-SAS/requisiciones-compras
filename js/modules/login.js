/**
 * ============================================================
 * MÓDULO: LOGIN
 * ============================================================
 * Controla toda la lógica de la página de inicio de sesión.
 * ============================================================
 */

import { supabase } from '../config/supabase.js';
import { iniciarSesion, obtenerSesion } from '../services/auth.service.js';
import { Toast } from '../components/toast.js';
import { Loader } from '../components/loader.js';

/**
 * Inicializar la página de login
 */
async function inicializar() {
    // Si ya tiene sesión activa, redirigir al dashboard
    const sesion = await obtenerSesion();
    if (sesion) {
        window.location.href = '/dashboard.html';
        return;
    }

    // Configurar el formulario
    configurarFormulario();
    configurarTogglePassword();
}

/**
 * Configurar el evento submit del formulario
 */
function configurarFormulario() {
    const formulario = document.getElementById('login-form');
    const btnLogin = document.getElementById('btn-login');
    const errorDiv = document.getElementById('login-error');

    if (!formulario) return;

    formulario.addEventListener('submit', async (e) => {
        e.preventDefault();

        // Obtener valores
        const email = document.getElementById('login-email').value.trim();
        const password = document.getElementById('login-password').value;

        // Validaciones básicas
        if (!email || !password) {
            mostrarError(errorDiv, 'Ingrese su correo y contraseña.');
            return;
        }

        // Deshabilitar botón y mostrar loader
        btnLogin.disabled = true;
        btnLogin.classList.add('btn-cargando');
        btnLogin.textContent = 'Ingresando...';
        ocultarError(errorDiv);

        // Intentar login
        const resultado = await iniciarSesion(email, password);

        if (resultado.error) {
            mostrarError(errorDiv, resultado.error);
            btnLogin.disabled = false;
            btnLogin.classList.remove('btn-cargando');
            btnLogin.textContent = 'Ingresar';
            return;
        }

        // Login exitoso
        Toast.exito(`Bienvenido, ${resultado.perfil.nombre_completo}`);

        // Si requiere cambiar contraseña, redirigir ahí
        const destino = resultado.perfil.requiere_cambio_password
            ? '/cambiar-password.html'
            : '/dashboard.html';

        setTimeout(() => {
            window.location.href = destino;
        }, 800);
    });
}

/**
 * Mostrar/ocultar contraseña
 */
function configurarTogglePassword() {
    const toggle = document.getElementById('password-toggle');
    const input = document.getElementById('login-password');

    if (!toggle || !input) return;

    toggle.addEventListener('click', () => {
        const tipo = input.type === 'password' ? 'text' : 'password';
        input.type = tipo;
        toggle.textContent = tipo === 'password' ? '👁' : '👁‍🗨';
    });
}

/**
 * Mostrar mensaje de error
 */
function mostrarError(elemento, mensaje) {
    if (elemento) {
        elemento.textContent = mensaje;
        elemento.classList.add('visible');
    }
}

/**
 * Ocultar mensaje de error
 */
function ocultarError(elemento) {
    if (elemento) {
        elemento.textContent = '';
        elemento.classList.remove('visible');
    }
}

// ─── Ejecutar cuando la página cargue ───
document.addEventListener('DOMContentLoaded', inicializar);
