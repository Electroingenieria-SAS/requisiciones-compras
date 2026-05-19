/**
 * ============================================================
 * SERVICIO: AUTENTICACIÓN
 * ============================================================
 * Maneja login, logout, verificación de sesión y perfiles.
 * Usa Supabase Auth internamente.
 * 
 * IMPORTANTE: Los usuarios inician sesión con su "proceso" 
 * (nombre visible) pero internamente se autentica con email/password.
 * ============================================================
 */

import { supabase } from '../config/supabase.js';

/**
 * Iniciar sesión con email y contraseña
 * @param {string} email - Correo del usuario
 * @param {string} password - Contraseña
 * @returns {Object} { usuario, perfil, error }
 */
export async function iniciarSesion(email, password) {
    try {
        // 1. Autenticar con Supabase Auth
        const { data, error } = await supabase.auth.signInWithPassword({
            email: email.trim().toLowerCase(),
            password: password
        });

        if (error) {
            return {
                usuario: null,
                perfil: null,
                error: traducirError(error.message)
            };
        }

        // 2. Obtener perfil del usuario
        const perfil = await obtenerPerfil(data.user.id);

        if (!perfil) {
            return {
                usuario: null,
                perfil: null,
                error: 'No se encontró el perfil de usuario. Contacte al administrador.'
            };
        }

        // 3. Verificar que el usuario esté activo
        if (!perfil.activo) {
            await supabase.auth.signOut();
            return {
                usuario: null,
                perfil: null,
                error: 'Su cuenta está desactivada. Contacte al administrador.'
            };
        }

        return {
            usuario: data.user,
            perfil: perfil,
            error: null
        };

    } catch (err) {
        console.error('Error en iniciarSesion:', err);
        return {
            usuario: null,
            perfil: null,
            error: 'Error de conexión. Intente nuevamente.'
        };
    }
}

/**
 * Cerrar sesión
 */
export async function cerrarSesion() {
    try {
        await supabase.auth.signOut();
        window.location.href = '/index.html';
    } catch (err) {
        console.error('Error al cerrar sesión:', err);
        window.location.href = '/index.html';
    }
}

/**
 * Obtener la sesión actual (si existe)
 * @returns {Object|null} Sesión activa o null
 */
export async function obtenerSesion() {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        return session;
    } catch (err) {
        console.error('Error al obtener sesión:', err);
        return null;
    }
}

/**
 * Obtener el perfil de un usuario por su ID
 * @param {string} userId - UUID del usuario
 * @returns {Object|null} Perfil del usuario
 */
export async function obtenerPerfil(userId) {
    try {
        const { data, error } = await supabase
            .from('perfiles')
            .select('*')
            .eq('id', userId)
            .single();

        if (error) {
            console.error('Error al obtener perfil:', error);
            return null;
        }

        return data;
    } catch (err) {
        console.error('Error en obtenerPerfil:', err);
        return null;
    }
}

/**
 * Proteger una página: redirige al login si no hay sesión
 * También redirige a cambio de contraseña si el usuario lo requiere.
 * Debe llamarse al inicio de cada página protegida.
 * @returns {Object} { usuario, perfil }
 */
export async function protegerRuta() {
    const sesion = await obtenerSesion();

    if (!sesion) {
        window.location.href = '/index.html';
        return { usuario: null, perfil: null };
    }

    const perfil = await obtenerPerfil(sesion.user.id);

    if (!perfil || !perfil.activo) {
        await cerrarSesion();
        return { usuario: null, perfil: null };
    }

    // Si requiere cambiar contraseña, redirigir (excepto si ya está en esa página)
    if (perfil.requiere_cambio_password && !window.location.pathname.includes('cambiar-password')) {
        window.location.href = '/cambiar-password.html';
        return { usuario: null, perfil: null };
    }

    return {
        usuario: sesion.user,
        perfil: perfil
    };
}

/**
 * Verificar si el usuario actual es administrador
 * @param {Object} perfil - Perfil del usuario
 * @returns {boolean}
 */
export function esAdministrador(perfil) {
    return perfil && perfil.rol === 'administrador';
}

/**
 * Traduce mensajes de error de Supabase al español
 */
function traducirError(mensaje) {
    const traducciones = {
        'Invalid login credentials': 'Credenciales incorrectas. Verifique su correo y contraseña.',
        'Email not confirmed': 'El correo no ha sido confirmado.',
        'User not found': 'Usuario no encontrado.',
        'Too many requests': 'Demasiados intentos. Espere un momento.',
        'Network error': 'Error de conexión. Verifique su internet.'
    };

    return traducciones[mensaje] || `Error: ${mensaje}`;
}
