/**
 * ============================================================
 * VERCEL FUNCTION: NOTIFICACIÓN DE APROBACIÓN AL JEFE
 * ============================================================
 * Envía un correo al jefe directo cuando se crea una requisición
 * que requiere su aprobación.
 *
 * Usa Resend (resend.com) como servicio de email.
 * ============================================================
 */

export default async function handler(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

    try {
        const RESEND_API_KEY = process.env.RESEND_API_KEY;
        const SUPABASE_URL = process.env.SUPABASE_URL;
        const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!RESEND_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
            return res.status(500).json({ error: 'Servicio de correo no configurado.' });
        }

        const {
            id_requisicion,
            jefe_id,
            nombre_jefe,
            solicitante,
            solicitante_email,
            proceso,
            objeto_compra,
            cantidad,
            rango_precios,
            lugar_entrega,
            unidad_negocio,
            centro_costo,
            observaciones
        } = req.body;

        if (!id_requisicion || !jefe_id) {
            return res.status(400).json({ error: 'Faltan datos obligatorios (id_requisicion o jefe_id).' });
        }

        // Obtener email del jefe desde auth.users usando service_role_key
        const userResponse = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${jefe_id}`, {
            headers: {
                'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                'apikey': SUPABASE_SERVICE_ROLE_KEY
            }
        });

        if (!userResponse.ok) {
            return res.status(500).json({ error: 'No se pudo obtener el correo del jefe.' });
        }

        const userData = await userResponse.json();
        const jefeEmail = userData.email;

        if (!jefeEmail) {
            return res.status(400).json({ error: 'El jefe no tiene correo registrado.' });
        }

        // Construir email HTML profesional
        const htmlEmail = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 0; background: #f4f5f6; }
        .container { max-width: 600px; margin: 20px auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
        .header { background: #00369C; color: white; padding: 24px 32px; }
        .header h1 { margin: 0; font-size: 18px; font-weight: 600; }
        .header p { margin: 4px 0 0; font-size: 13px; opacity: 0.85; }
        .alerta-badge { display: inline-block; background: #FEE2E2; color: #B91C1C; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; margin-bottom: 12px; }
        .body { padding: 32px; }
        .info-row { display: flex; padding: 10px 0; border-bottom: 1px solid #f0f0f0; }
        .info-label { color: #6B7280; font-size: 13px; width: 160px; flex-shrink: 0; }
        .info-value { color: #1F2937; font-size: 14px; font-weight: 500; flex: 1; }
        .objeto-box { background: #f8f9fc; border-left: 4px solid #00369C; padding: 16px; border-radius: 0 8px 8px 0; margin: 16px 0; }
        .objeto-box p { margin: 0; color: #1F2937; font-size: 14px; line-height: 1.5; }
        .objeto-box strong { color: #00369C; }
        .footer { background: #f8f9fc; padding: 20px 32px; text-align: center; border-top: 1px solid #e5e7eb; }
        .footer p { margin: 0; color: #9CA3AF; font-size: 12px; }
        .btn { display: inline-block; padding: 14px 32px; background: #00369C; color: white !important; text-decoration: none; border-radius: 8px; font-size: 15px; font-weight: 600; margin-top: 8px; }
        .btn-container { text-align: center; margin: 24px 0 8px; }
        .nota { background: #FEF3C7; border-left: 3px solid #F59E0B; padding: 12px 16px; border-radius: 0 6px 6px 0; margin-top: 16px; font-size: 13px; color: #92400E; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>⚠️ Aprobación de Requisición Pendiente</h1>
            <p>Electroingeniería S.A.S.</p>
        </div>
        <div class="body">
            <span class="alerta-badge">Acción requerida</span>
            <p style="margin: 0 0 16px; font-size: 15px; color: #1F2937;">
                Hola <strong>${nombre_jefe || 'jefe'}</strong>,
            </p>
            <p style="margin: 0 0 16px; font-size: 14px; color: #4B5563; line-height: 1.6;">
                Se ha creado una nueva requisición de compras que requiere tu aprobación como jefe directo del solicitante.
                Por favor, ingresa al sistema para revisar y aprobar o rechazar.
            </p>

            <div style="margin: 24px 0 16px;">
                <span style="font-size: 22px; font-weight: 700; color: #00369C;">${id_requisicion}</span>
            </div>

            <div class="objeto-box">
                <p><strong>Objeto de la compra:</strong></p>
                <p>${objeto_compra}</p>
            </div>

            <div class="info-row">
                <span class="info-label">Solicitante</span>
                <span class="info-value">${solicitante}${solicitante_email ? ` <span style="color:#6B7280;font-size:12px;">(${solicitante_email})</span>` : ''}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Proceso</span>
                <span class="info-value">${proceso}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Cantidad</span>
                <span class="info-value">${cantidad}</span>
            </div>
            ${rango_precios ? `
            <div class="info-row">
                <span class="info-label">Valor estimado</span>
                <span class="info-value">${rango_precios}</span>
            </div>` : ''}
            ${lugar_entrega ? `
            <div class="info-row">
                <span class="info-label">Lugar de entrega</span>
                <span class="info-value">${lugar_entrega}</span>
            </div>` : ''}
            ${unidad_negocio ? `
            <div class="info-row">
                <span class="info-label">Unidad de negocio</span>
                <span class="info-value">${unidad_negocio}</span>
            </div>` : ''}
            ${centro_costo ? `
            <div class="info-row">
                <span class="info-label">Centro de costo</span>
                <span class="info-value">${centro_costo}</span>
            </div>` : ''}
            ${observaciones ? `
            <div class="info-row">
                <span class="info-label">Observaciones</span>
                <span class="info-value">${observaciones}</span>
            </div>` : ''}

            <div class="btn-container">
                <a href="https://requisiciones-electroingenieria.vercel.app/requisiciones.html" class="btn">
                    Revisar y aprobar →
                </a>
            </div>

            <div class="nota">
                <strong>Recuerda:</strong> Mientras no apruebes o rechaces, la requisición no podrá ser gestionada por el área de Compras.
            </div>
        </div>
        <div class="footer">
            <p>Sistema de Requisiciones de Compras Administrativas</p>
            <p>Electroingeniería S.A.S. — Correo automático, no responder</p>
        </div>
    </div>
</body>
</html>`;

        // Enviar correo con Resend
        const emailResponse = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${RESEND_API_KEY}`
            },
            body: JSON.stringify({
                from: 'Requisiciones EI <onboarding@resend.dev>',
                to: jefeEmail,
                subject: `🔔 Aprobación pendiente: ${id_requisicion} — ${objeto_compra.substring(0, 50)}`,
                html: htmlEmail
            })
        });

        const emailResult = await emailResponse.json();

        if (!emailResponse.ok) {
            console.error('Error Resend:', emailResult);
            return res.status(500).json({ error: 'Error al enviar el correo.' });
        }

        return res.status(200).json({
            mensaje: 'Correo de aprobación enviado correctamente.',
            destinatario: jefeEmail,
            emailId: emailResult.id
        });

    } catch (err) {
        console.error('Error en notificar-aprobacion:', err);
        return res.status(500).json({ error: 'Error interno al enviar notificación.' });
    }
}
