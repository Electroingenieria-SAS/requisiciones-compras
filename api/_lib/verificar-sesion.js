// Valida el token de sesión del que llama contra Supabase Auth.
// Devuelve { user } si es válido, o { error, status } si no.
export async function verificarSesion(req) {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
        return { user: null, error: 'No autorizado.', status: 401 };
    }

    const resp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: {
            'Authorization': `Bearer ${token}`,
            'apikey': SUPABASE_ANON_KEY
        }
    });

    if (!resp.ok) {
        return { user: null, error: 'Sesión inválida.', status: 401 };
    }

    return { user: await resp.json(), error: null, status: 200 };
}
