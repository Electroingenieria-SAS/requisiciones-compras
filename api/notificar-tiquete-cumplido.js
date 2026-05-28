/**
 * ============================================================
 * VERCEL FUNCTION: NOTIFICACIÓN DE TIQUETE CUMPLIDO
 * ============================================================
 * Envía al solicitante un correo con el código de reserva,
 * enlaces para descargar el PDF del tiquete y la confirmación
 * del hotel (si aplica), más recordatorios y datos de contacto.
 * ============================================================
 */

export default async function handler(req, res) {
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
            id_tiquete,
            user_id,
            solicitante,
            pasajero_nombre,
            pasajero_cedula,
            destino,
            fecha_ida,
            hora_ida,
            fecha_regreso,
            hora_regreso,
            origen_regreso,
            solo_ida,
            requiere_hotel,
            hotel_ciudad,
            hotel_fecha_checkin,
            hotel_fecha_checkout,
            codigo_reserva,
            tiquete_pdf_path,
            hotel_confirmacion_path,
            observaciones_entrega
        } = req.body;

        if (!id_tiquete || !user_id || !codigo_reserva) {
            return res.status(400).json({ error: 'Faltan datos obligatorios.' });
        }

        // 1. Obtener email del solicitante
        const userResponse = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${user_id}`, {
            headers: {
                'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                'apikey': SUPABASE_SERVICE_ROLE_KEY
            }
        });

        if (!userResponse.ok) {
            return res.status(500).json({ error: 'No se pudo obtener el correo del solicitante.' });
        }

        const userData = await userResponse.json();
        const emailSolicitante = userData.email;

        if (!emailSolicitante) {
            return res.status(400).json({ error: 'El solicitante no tiene correo registrado.' });
        }

        // 2. Generar URLs firmadas (válidas 30 días) para los PDFs
        async function generarUrlFirmada(path) {
            if (!path) return null;
            try {
                const r = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/tiquetes-documentos/${path}`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                        'apikey': SUPABASE_SERVICE_ROLE_KEY,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ expiresIn: 30 * 24 * 60 * 60 }) // 30 días
                });
                if (!r.ok) return null;
                const data = await r.json();
                return data.signedURL ? `${SUPABASE_URL}/storage/v1${data.signedURL}` : null;
            } catch (e) {
                console.error('Error firmando URL:', e);
                return null;
            }
        }

        const urlTiquete = await generarUrlFirmada(tiquete_pdf_path);
        const urlHotel = requiere_hotel ? await generarUrlFirmada(hotel_confirmacion_path) : null;

        // 3. Formatear fechas a español
        const formatFecha = (f) => {
            if (!f) return '';
            const d = new Date(f + 'T00:00:00');
            return d.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        };

        // 4. Construir el correo HTML
        const htmlEmail = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 0; background: #f4f5f6; color: #1F2937; }
        .container { max-width: 640px; margin: 20px auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #00369C, #1E40AF); color: white; padding: 28px 32px; text-align: center; }
        .header-icon { font-size: 36px; margin-bottom: 8px; }
        .header h1 { margin: 0; font-size: 22px; font-weight: 700; }
        .header p { margin: 6px 0 0; font-size: 14px; opacity: 0.9; }
        .body { padding: 28px 32px; }
        .saludo { font-size: 15px; color: #1F2937; margin-bottom: 18px; }
        .saludo strong { color: #00369C; }

        .codigo-card { background: linear-gradient(135deg, #FEF3C7, #FDE68A); border-left: 5px solid #F59E0B; padding: 18px; border-radius: 8px; margin: 20px 0; text-align: center; }
        .codigo-label { font-size: 11px; color: #92400E; text-transform: uppercase; letter-spacing: 1px; font-weight: 700; margin-bottom: 6px; }
        .codigo-valor { font-size: 28px; color: #92400E; font-weight: 700; letter-spacing: 2px; font-family: 'Courier New', monospace; }
        .codigo-nota { font-size: 12px; color: #92400E; margin-top: 8px; }

        .viaje-card { background: #f8f9fc; border-radius: 8px; padding: 18px; margin: 16px 0; }
        .viaje-titulo { font-size: 13px; color: #00369C; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 10px; }
        .viaje-row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #E5E7EB; font-size: 14px; }
        .viaje-row:last-child { border-bottom: none; }
        .viaje-label { color: #6B7280; }
        .viaje-value { color: #1F2937; font-weight: 600; text-align: right; }

        .btn { display: inline-block; padding: 12px 24px; background: #00369C; color: white !important; text-decoration: none; border-radius: 8px; font-size: 14px; font-weight: 600; margin: 6px 4px; }
        .btn-secundario { background: #6B7280; }
        .botones-descarga { text-align: center; margin: 22px 0; }

        .recordatorios { background: #ECFDF5; border-left: 4px solid #10B981; padding: 16px; border-radius: 0 8px 8px 0; margin: 20px 0; }
        .recordatorios-titulo { color: #065F46; font-weight: 700; font-size: 14px; margin-bottom: 10px; }
        .recordatorios ul { margin: 0; padding-left: 20px; color: #1F2937; font-size: 13px; line-height: 1.7; }
        .recordatorios li { margin-bottom: 4px; }
        .recordatorios strong { color: #065F46; }

        .contacto { background: #DBEAFE; border-radius: 8px; padding: 16px; margin: 20px 0; }
        .contacto-titulo { color: #1E40AF; font-weight: 700; font-size: 14px; margin-bottom: 8px; }
        .contacto p { margin: 4px 0; font-size: 13px; color: #1F2937; }
        .contacto a { color: #1E40AF; text-decoration: none; font-weight: 600; }

        .footer { background: #f8f9fc; padding: 20px 32px; text-align: center; border-top: 1px solid #E5E7EB; }
        .footer p { margin: 2px 0; color: #9CA3AF; font-size: 11px; }
    </style>
</head>
<body>
    <div class="container">

        <div class="header">
            <div class="header-icon">✈️</div>
            <h1>Tu viaje está confirmado</h1>
            <p>Electroingeniería S.A.S.</p>
        </div>

        <div class="body">

            <p class="saludo">
                Hola <strong>${pasajero_nombre || solicitante}</strong>,<br>
                Tu solicitud de tiquete aéreo <strong>${id_tiquete}</strong> ha sido gestionada exitosamente.
                A continuación encontrarás todos los detalles del viaje y los documentos necesarios.
            </p>

            <!-- CÓDIGO DE RESERVA -->
            <div class="codigo-card">
                <div class="codigo-label">Código de reserva</div>
                <div class="codigo-valor">${codigo_reserva}</div>
                <div class="codigo-nota">Preséntalo en el counter de la aerolínea o úsalo para check-in online</div>
            </div>

            <!-- INFORMACIÓN DEL VIAJE -->
            <div class="viaje-card">
                <div class="viaje-titulo">📍 Información del viaje</div>
                <div class="viaje-row"><span class="viaje-label">Pasajero</span><span class="viaje-value">${pasajero_nombre}</span></div>
                <div class="viaje-row"><span class="viaje-label">Cédula</span><span class="viaje-value">${pasajero_cedula}</span></div>
                <div class="viaje-row"><span class="viaje-label">Destino</span><span class="viaje-value">${destino}</span></div>
                <div class="viaje-row"><span class="viaje-label">Ida</span><span class="viaje-value">${formatFecha(fecha_ida)}${hora_ida ? ' · ' + hora_ida : ''}</span></div>
                ${solo_ida
                    ? `<div class="viaje-row"><span class="viaje-label">Tipo</span><span class="viaje-value">Solo ida</span></div>`
                    : `<div class="viaje-row"><span class="viaje-label">Regreso</span><span class="viaje-value">${formatFecha(fecha_regreso)}${hora_regreso ? ' · ' + hora_regreso : ''}${origen_regreso ? '<br>desde ' + origen_regreso : ''}</span></div>`
                }
            </div>

            <!-- BOTONES DE DESCARGA -->
            <div class="botones-descarga">
                ${urlTiquete ? `<a href="${urlTiquete}" class="btn">📄 Descargar tiquete aéreo</a>` : ''}
                ${urlHotel ? `<a href="${urlHotel}" class="btn btn-secundario">🏨 Descargar confirmación de hotel</a>` : ''}
            </div>

            ${requiere_hotel ? `
            <div class="viaje-card">
                <div class="viaje-titulo">🏨 Información del hotel</div>
                ${hotel_ciudad ? `<div class="viaje-row"><span class="viaje-label">Ciudad</span><span class="viaje-value">${hotel_ciudad}</span></div>` : ''}
                ${hotel_fecha_checkin ? `<div class="viaje-row"><span class="viaje-label">Check-in</span><span class="viaje-value">${formatFecha(hotel_fecha_checkin)}</span></div>` : ''}
                ${hotel_fecha_checkout ? `<div class="viaje-row"><span class="viaje-label">Check-out</span><span class="viaje-value">${formatFecha(hotel_fecha_checkout)}</span></div>` : ''}
            </div>` : ''}

            <!-- RECORDATORIOS -->
            <div class="recordatorios">
                <div class="recordatorios-titulo">📋 Antes de tu viaje, recuerda:</div>
                <ul>
                    <li>Llegar al aeropuerto al menos <strong>2 horas antes</strong> del vuelo nacional, o <strong>3 horas antes</strong> del internacional</li>
                    <li>Llevar tu <strong>cédula original</strong> (no copia ni foto)</li>
                    <li>El <strong>equipaje de mano</strong> no debe exceder los 10 kg ni las dimensiones permitidas por la aerolínea</li>
                    <li>Revisa la política de <strong>maletas facturadas</strong> según tu tarifa</li>
                    <li>Conserva los <strong>comprobantes</strong> de gastos relacionados al viaje</li>
                    <li>Activa el <strong>roaming</strong> o lleva eSIM si viajas al exterior</li>
                </ul>
            </div>

            ${observaciones_entrega ? `
            <div style="background:#FEF3C7;border-left:4px solid #F59E0B;padding:12px 16px;border-radius:0 8px 8px 0;margin:18px 0;">
                <strong style="color:#92400E;">Notas del área de Compras:</strong>
                <p style="margin:6px 0 0;color:#1F2937;font-size:13px;">${observaciones_entrega}</p>
            </div>` : ''}

            <!-- CONTACTO -->
            <div class="contacto">
                <div class="contacto-titulo">¿Necesitas hacer un cambio?</div>
                <p>Si requieres modificar fechas, cancelar o algún tipo de ajuste, contacta lo antes posible al área de Compras:</p>
                <p>📧 <a href="mailto:facturas@ei.com.co">facturas@ei.com.co</a></p>
                <p>📱 <a href="tel:+573173706881">317 370 6881</a></p>
            </div>

        </div>

        <div class="footer">
            <p>Sistema de Tiquetes Aéreos · Electroingeniería S.A.S.</p>
            <p>Correo automático, no responder a este correo</p>
        </div>

    </div>
</body>
</html>`;

        // 5. Enviar correo con Resend
        const emailResponse = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${RESEND_API_KEY}`
            },
            body: JSON.stringify({
                from: 'Tiquetes EI <onboarding@resend.dev>',
                to: emailSolicitante,
                subject: `✈️ Tu viaje a ${destino} está confirmado — ${id_tiquete}`,
                html: htmlEmail
            })
        });

        const emailResult = await emailResponse.json();

        if (!emailResponse.ok) {
            console.error('Error Resend:', emailResult);
            return res.status(500).json({ error: 'Error al enviar el correo.' });
        }

        return res.status(200).json({
            mensaje: 'Correo de tiquete cumplido enviado correctamente.',
            destinatario: emailSolicitante,
            emailId: emailResult.id
        });

    } catch (err) {
        console.error('Error en notificar-tiquete-cumplido:', err);
        return res.status(500).json({ error: 'Error interno al enviar notificación.' });
    }
}
