

import { supabase } from '../config/supabase.js';
import { iniciarSesion, obtenerSesion } from '../services/auth.service.js';
import { Toast } from '../components/toast.js';
import { Loader } from '../components/loader.js';

async function inicializar() {
    const sesion = await obtenerSesion();
    if (sesion) {
        window.location.href = '/dashboard.html';
        return;
    }

    configurarFormulario();
    configurarTogglePassword();
}

function configurarFormulario() {
    const formulario = document.getElementById('login-form');
    const btnLogin = document.getElementById('btn-login');
    const errorDiv = document.getElementById('login-error');

    if (!formulario) return;

    formulario.addEventListener('submit', async (e) => {
        e.preventDefault();

        const email = document.getElementById('login-email').value.trim();
        const password = document.getElementById('login-password').value;

        if (!email || !password) {
            mostrarError(errorDiv, 'Ingrese su correo y contraseña.');
            return;
        }

        btnLogin.disabled = true;
        btnLogin.classList.add('btn-cargando');
        btnLogin.textContent = 'Ingresando...';
        ocultarError(errorDiv);

        const resultado = await iniciarSesion(email, password);

        if (resultado.error) {
            mostrarError(errorDiv, resultado.error);
            btnLogin.disabled = false;
            btnLogin.classList.remove('btn-cargando');
            btnLogin.textContent = 'Ingresar';
            return;
        }

        Toast.exito(`Bienvenido, ${resultado.perfil.nombre_completo}`);

        const destino = resultado.perfil.requiere_cambio_password
            ? '/cambiar-password.html'
            : '/dashboard.html';

        setTimeout(() => {
            window.location.href = destino;
        }, 800);
    });
}

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

function mostrarError(elemento, mensaje) {
    if (elemento) {
        elemento.textContent = mensaje;
        elemento.classList.add('visible');
    }
}


function ocultarError(elemento) {
    if (elemento) {
        elemento.textContent = '';
        elemento.classList.remove('visible');
    }
}

document.addEventListener('DOMContentLoaded', inicializar);
