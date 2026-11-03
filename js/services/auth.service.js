
import { supabase } from '../config/supabase.js';


export async function iniciarSesion(email, password) {
    try {
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

        const perfil = await obtenerPerfil(data.user.id);

        if (!perfil) {
            return {
                usuario: null,
                perfil: null,
                error: 'No se encontró el perfil de usuario. Contacte al administrador.'
            };
        }

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


export async function cerrarSesion() {
    try {
        await supabase.auth.signOut();
        window.location.href = '/index.html';
    } catch (err) {
        console.error('Error al cerrar sesión:', err);
        window.location.href = '/index.html';
    }
}

export async function obtenerSesion() {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        return session;
    } catch (err) {
        console.error('Error al obtener sesión:', err);
        return null;
    }
}

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

    if (perfil.requiere_cambio_password && !window.location.pathname.includes('cambiar-password')) {
        window.location.href = '/cambiar-password.html';
        return { usuario: null, perfil: null };
    }

    return {
        usuario: sesion.user,
        perfil: perfil
    };
}

export function esAdministrador(perfil) {
    return perfil && (perfil.rol === 'super_admin' || perfil.rol === 'administrador');
}

export function puedeGestionarUsuarios(perfil) {
    if (!perfil) return false;
    return perfil.rol === 'super_admin' || perfil.rol === 'admin_compras' || perfil.rol === 'administrador';
}

export function etiquetaRol(rol) {
    const map = {
        'super_admin': 'Super Administrador',
        'director': 'Director',
        'jefe': 'Jefe',
        'admin_compras': 'Administrador de Compras',
        'usuario': 'Usuario',
        'administrador': 'Administrador'
    };
    return map[rol] || rol;
}

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
