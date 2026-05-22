/**
 * ============================================================
 * VERCEL FUNCTION: ADMINISTRACIÓN DE USUARIOS
 * ============================================================
 * Función serverless que crea usuarios y resetea contraseñas
 * en Supabase Auth de forma segura.
 * ============================================================
 */

export default async function handler(req, res) {
    // Headers CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    // Preflight
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Solo POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método no permitido' });
    }

    try {
        // Variables de entorno
        const SUPABASE_URL = process.env.SUPABASE_URL;
        const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
        const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

        if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
            return res.status(500).json({ error: 'Configuración del servidor incompleta. Contacte al administrador.' });
        }

        // Verificar autenticación
        const authToken = req.headers.authorization?.replace('Bearer ', '');
        if (!authToken) {
            return res.status(401).json({ error: 'No autorizado.' });
        }

        // Verificar el usuario que hace la petición
        const userResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'apikey': SUPABASE_ANON_KEY || SUPABASE_SERVICE_ROLE_KEY
            }
        });

        if (!userResponse.ok) {
            return res.status(401).json({ error: 'Sesión inválida.' });
        }

        const currentUser = await userResponse.json();

        // Verificar que es administrador
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
            return res.status(403).json({ error: 'Solo los administradores pueden crear usuarios.' });
        }

        // Parsear datos
        const { action, email, password, nombre_completo, proceso, rol, user_id, nuevo_password, jefe_id, nombre_jefe } = req.body;

        // ─── CREAR USUARIO ───
        if (action === 'crear') {
            if (!email || !password || !nombre_completo || !proceso) {
                return res.status(400).json({ error: 'Faltan campos obligatorios.' });
            }

            // Crear en Auth
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
                const msg = createData.msg || createData.message || 'Error al crear usuario.';
                if (msg.includes('already been registered') || msg.includes('already exists')) {
                    return res.status(400).json({ error: 'Ya existe un usuario con ese correo.' });
                }
                return res.status(400).json({ error: msg });
            }

            // Crear perfil
            const perfilData = {
                id: createData.id,
                nombre_completo: nombre_completo.trim(),
                proceso: proceso.trim(),
                rol: rol || 'usuario',
                activo: true,
                requiere_cambio_password: true,
                jefe_id: jefe_id || null,
                nombre_jefe: nombre_jefe || null
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
                // Rollback: eliminar usuario de Auth
                await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${createData.id}`, {
                    method: 'DELETE',
                    headers: {
                        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                        'apikey': SUPABASE_SERVICE_ROLE_KEY
                    }
                });
                return res.status(500).json({ error: 'Error al crear el perfil del usuario.' });
            }

            const perfilResult = await perfilInsert.json();

            return res.status(200).json({
                mensaje: 'Usuario creado correctamente.',
                usuario: { id: createData.id, email: createData.email, perfil: perfilResult[0] }
            });
        }

        // ─── RESETEAR CONTRASEÑA ───
        if (action === 'resetear_password') {
            if (!user_id || !nuevo_password) {
                return res.status(400).json({ error: 'Falta el ID de usuario o la nueva contraseña.' });
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
                return res.status(500).json({ error: 'Error al cambiar la contraseña.' });
            }

            // Marcar que el usuario debe cambiar la contraseña en su próximo login
            await fetch(`${SUPABASE_URL}/rest/v1/perfiles?id=eq.${user_id}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                    'apikey': SUPABASE_SERVICE_ROLE_KEY
                },
                body: JSON.stringify({ requiere_cambio_password: true })
            });

            return res.status(200).json({ mensaje: 'Contraseña actualizada correctamente.' });
        }

        return res.status(400).json({ error: 'Acción no reconocida.' });

    } catch (err) {
        console.error('Error en función:', err);
        return res.status(500).json({ error: 'Error interno del servidor.' });
    }
}
