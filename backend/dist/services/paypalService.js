"use strict";
/**
 * Integración mínima con PayPal Subscriptions (REST v1).
 * Requiere en .env: PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_API_BASE
 * (sandbox: https://api-m.sandbox.paypal.com, live: https://api-m.paypal.com)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAccessToken = getAccessToken;
exports.createPaypalSubscriptionApproval = createPaypalSubscriptionApproval;
exports.verifyPaypalWebhookSignature = verifyPaypalWebhookSignature;
let cachedToken = null;
/** OAuth2 client_credentials; reutilizable por otros servicios PayPal (catálogo, planes, etc.). */
async function getAccessToken() {
    const id = process.env.PAYPAL_CLIENT_ID;
    const secret = process.env.PAYPAL_CLIENT_SECRET;
    const base = process.env.PAYPAL_API_BASE || 'https://api-m.sandbox.paypal.com';
    if (!id || !secret)
        return null;
    if (cachedToken && cachedToken.expires > Date.now() + 5000) {
        return cachedToken.token;
    }
    const auth = Buffer.from(`${id}:${secret}`).toString('base64');
    const res = await fetch(`${base}/v1/oauth2/token`, {
        method: 'POST',
        headers: {
            Authorization: `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials',
    });
    if (!res.ok) {
        console.error('PayPal OAuth failed', await res.text());
        return null;
    }
    const data = (await res.json());
    cachedToken = {
        token: data.access_token,
        expires: Date.now() + (data.expires_in || 300) * 1000,
    };
    return cachedToken.token;
}
async function createPaypalSubscriptionApproval(params) {
    const { paypalPlanId, returnUrl, cancelUrl, userId } = params;
    if (!paypalPlanId || !paypalPlanId.trim()) {
        return {
            ok: false,
            message: 'Configura paypal_plan_id_monthly / paypal_plan_id_yearly en el plan (desde el panel de planes).',
        };
    }
    const token = await getAccessToken();
    const base = process.env.PAYPAL_API_BASE || 'https://api-m.sandbox.paypal.com';
    if (!token) {
        return {
            ok: false,
            message: 'Faltan PAYPAL_CLIENT_ID y PAYPAL_CLIENT_SECRET en el servidor.',
        };
    }
    if (!returnUrl || !cancelUrl) {
        return {
            ok: false,
            message: 'Configura PAYPAL_RETURN_URL y PAYPAL_CANCEL_URL o envía returnUrl y cancelUrl en el body.',
        };
    }
    const body = {
        plan_id: paypalPlanId.trim(),
        custom_id: `user:${userId}`,
        application_context: {
            brand_name: 'Paulino Finance',
            locale: 'es-ES',
            shipping_preference: 'NO_SHIPPING',
            user_action: 'SUBSCRIBE_NOW',
            payment_method: {
                payer_selected: 'PAYPAL',
                payee_preferred: 'IMMEDIATE_PAYMENT_REQUIRED',
            },
            return_url: returnUrl,
            cancel_url: cancelUrl,
        },
    };
    const res = await fetch(`${base}/v1/billing/subscriptions`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            Prefer: 'return=representation',
        },
        body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) {
        console.error('PayPal create subscription', text);
        return { ok: false, message: `PayPal: ${text}` };
    }
    const sub = JSON.parse(text);
    const approve = sub.links?.find((l) => l.rel === 'approve')?.href;
    if (!approve) {
        return { ok: false, message: 'PayPal no devolvió enlace de aprobación' };
    }
    return { ok: true, approvalUrl: approve, paypalSubscriptionId: sub.id };
}
/**
 * Verifica la firma del webhook con POST /v1/notifications/verify-webhook-signature.
 * Requiere PAYPAL_WEBHOOK_ID (ID del webhook en el panel de desarrollador PayPal).
 */
async function verifyPaypalWebhookSignature(params) {
    const { webhookId, webhookEvent, transmissionId, transmissionTime, certUrl, authAlgo, transmissionSig, } = params;
    if (!transmissionId ||
        !transmissionTime ||
        !certUrl ||
        !authAlgo ||
        !transmissionSig) {
        console.error('PayPal webhook: faltan headers de transmisión');
        return false;
    }
    const token = await getAccessToken();
    const base = process.env.PAYPAL_API_BASE || 'https://api-m.sandbox.paypal.com';
    if (!token) {
        console.error('PayPal webhook: no se pudo obtener token OAuth');
        return false;
    }
    const res = await fetch(`${base}/v1/notifications/verify-webhook-signature`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            auth_algo: authAlgo,
            cert_url: certUrl,
            transmission_id: transmissionId,
            transmission_sig: transmissionSig,
            transmission_time: transmissionTime,
            webhook_id: webhookId,
            webhook_event: webhookEvent,
        }),
    });
    const text = await res.text();
    if (!res.ok) {
        console.error('PayPal verify-webhook-signature', res.status, text);
        return false;
    }
    try {
        const data = JSON.parse(text);
        return data.verification_status === 'SUCCESS';
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=paypalService.js.map