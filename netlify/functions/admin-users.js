/**
 * ============================================================
 * NETLIFY FUNCTION: CREAR USUARIO
 * ============================================================
 * Función serverless que crea usuarios en Supabase Auth
 * de forma segura usando la service_role key.
 * 
 * La service_role key NUNCA se expone al frontend.
 * Se almacena como variable de entorno en Netlify.
 * ============================================================
 */

exports.handler = async (event) => {
    // Solo aceptar POST
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Método no permitido' }) };
    }

    // Headers CORS
    const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    };

    // Preflight CORS
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    try {
        // ─── Variables de entorno ───
        const SUPABASE_URL = process.env.SUPABASE_URL;
        const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
        const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

        if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
            return {
                statusCode: 500, headers,
                body: JSON.stringify({ error: 'Configuración del servidor incompleta. Contacte al administrador.' })
            };
        }

        // ─── Verificar que el solicitante es administrador ───
        const authToken = event.headers.authorization?.replace('Bearer ', '');
        if (!authToken) {
            return { statusCode: 401, headers, body: JSON.stringify({ error: 'No autorizado.' }) };
        }

        // Verificar el usuario que hace la petición
        const userResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'apikey': SUPABASE_ANON_KEY || SUPABASE_SERVICE_ROLE_KEY
            }
        });

        if (!userResponse.ok) {
            return { statusCode: 401, headers, body: JSON.stringify({ error: 'Sesión inválida.' }) };
        }

        const currentUser = await userResponse.json();

        // Verificar que es administrador consultando la tabla perfiles
        const perfilResponse = await fetch(
            `${SUPABASE_URL}/rest/v1/perfiles?id=eq.${currentUser.id}&select=rol`,
            {
                headers: {
                    'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                    'apikey': SUPABASE_SERVICE_ROLE_KEY
                }
            }
        );

        const perfiles = await perfilResponse.json();
        if (!perfiles.length || perfiles[0].rol !== 'administrador') {
            return { statusCode: 403, headers, body: JSON.stringify({ error: 'Solo los administradores pueden crear usuarios.' }) };
        }

        // ─── Parsear datos del nuevo usuario ───
        const { action, email, password, nombre_completo, proceso, rol, user_id, nuevo_password } = JSON.parse(event.body);

        // ─── ACCIÓN: CREAR USUARIO ───
        if (action === 'crear') {
            if (!email || !password || !nombre_completo || !proceso) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'Faltan campos obligatorios.' }) };
            }

            // 1. Crear usuario en Auth
            const createResponse = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                    'apikey': SUPABASE_SERVICE_ROLE_KEY
                },
                body: JSON.stringify({
                    email: email.trim().toLowerCase(),
                    password: password,
                    email_confirm: true
                })
            });

            const createData = await createResponse.json();

            if (!createResponse.ok) {
                const msg = createData.msg || createData.message || 'Error al crear usuario en Auth.';
                // Traducir errores comunes
                if (msg.includes('already been registered') || msg.includes('already exists')) {
                    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Ya existe un usuario con ese correo.' }) };
                }
                return { statusCode: 400, headers, body: JSON.stringify({ error: msg }) };
            }

            // 2. Crear perfil en la tabla perfiles
            const perfilData = {
                id: createData.id,
                nombre_completo: nombre_completo.trim(),
                proceso: proceso.trim(),
                rol: rol || 'usuario',
                activo: true
            };

            const perfilInsert = await fetch(`${SUPABASE_URL}/rest/v1/perfiles`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                    'apikey': SUPABASE_SERVICE_ROLE_KEY,
                    'Prefer': 'return=representation'
                },
                body: JSON.stringify(perfilData)
            });

            if (!perfilInsert.ok) {
                // Si falla el perfil, intentar eliminar el usuario de Auth
                await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${createData.id}`, {
                    method: 'DELETE',
                    headers: {
                        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                        'apikey': SUPABASE_SERVICE_ROLE_KEY
                    }
                });
                return { statusCode: 500, headers, body: JSON.stringify({ error: 'Error al crear el perfil del usuario.' }) };
            }

            const perfilResult = await perfilInsert.json();

            return {
                statusCode: 200, headers,
                body: JSON.stringify({
                    mensaje: 'Usuario creado correctamente.',
                    usuario: { id: createData.id, email: createData.email, perfil: perfilResult[0] }
                })
            };
        }

        // ─── ACCIÓN: RESETEAR CONTRASEÑA ───
        if (action === 'resetear_password') {
            if (!user_id || !nuevo_password) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'Falta el ID de usuario o la nueva contraseña.' }) };
            }

            const resetResponse = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${user_id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                    'apikey': SUPABASE_SERVICE_ROLE_KEY
                },
                body: JSON.stringify({ password: nuevo_password })
            });

            if (!resetResponse.ok) {
                return { statusCode: 500, headers, body: JSON.stringify({ error: 'Error al cambiar la contraseña.' }) };
            }

            return {
                statusCode: 200, headers,
                body: JSON.stringify({ mensaje: 'Contraseña actualizada correctamente.' })
            };
        }

        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Acción no reconocida.' }) };

    } catch (err) {
        console.error('Error en función:', err);
        return {
            statusCode: 500, headers,
            body: JSON.stringify({ error: 'Error interno del servidor.' })
        };
    }
};
