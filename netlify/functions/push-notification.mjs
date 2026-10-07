import webpush from "web-push";
import { db } from "./db.mjs";

export async function sendNewOrderPush(order) {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;

    if (!publicKey || !privateKey) {
        throw new Error("Clés VAPID absentes.");
    }

    webpush.setVapidDetails(
        "mailto:nicolas@atelierdugoutaulnay.com",
        publicKey,
        privateKey
    );

    const sql = db();

    const subscriptions = await sql`
        SELECT endpoint, p256dh, auth
        FROM push_subscriptions
    `;

    const amount = Number(order.total_cents || 0) / 100;

    const payload = JSON.stringify({
        title: "🛍️ Nouvelle commande",
        body: `${order.order_ref || "Commande"} — ${amount.toFixed(2).replace(".", ",")} €`,
        url: "/admin/commandes.html"
    });

    let sent = 0;
    let failed = 0;
    const errors = [];

    for (const sub of subscriptions) {
        try {
            await webpush.sendNotification({
                endpoint: sub.endpoint,
                keys: {
                    p256dh: sub.p256dh,
                    auth: sub.auth
                }
            }, payload);

            sent++;
        } catch (error) {
            failed++;

            const message = `${error.statusCode || ""} ${error.message || error}`;
            const detail = error.body ? String(error.body) : "";
            console.error("Erreur notification push:", message, detail);
            errors.push(detail ? `${message} — ${detail}` : message);
            if (error.statusCode === 404 || error.statusCode === 410 || (error.statusCode === 400 && String(error.body || "").includes("VapidPkHashMismatch"))) {
                await sql`
                    DELETE FROM push_subscriptions
                    WHERE endpoint = ${sub.endpoint}
                `;
            }
        }
    }

    return {
        subscriptions: subscriptions.length,
        sent,
        failed,
        errors
    };
}

export async function sendNewReservationPush(reservation) {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;

    if (!publicKey || !privateKey) {
        throw new Error("Clés VAPID absentes.");
    }

    webpush.setVapidDetails(
        "mailto:nicolas@atelierdugoutaulnay.com",
        publicKey,
        privateKey
    );

    const sql = db();

    const subscriptions = await sql`
        SELECT endpoint, p256dh, auth
        FROM push_subscriptions
    `;

    const time = String(reservation.reservation_time || "")
        .slice(0, 5)
        .replace(":", "h");

    const guests = Number(reservation.party_size || 0);

    const payload = JSON.stringify({
        title: "🍽️ Nouvelle réservation",
        body: `${time} — ${guests} personne${guests > 1 ? "s" : ""} — ${reservation.customer_name || "Client"}`,
        url: "/admin/reservations.html"
    });

    let sent = 0;
    let failed = 0;
    const errors = [];

    for (const sub of subscriptions) {
        try {
            await webpush.sendNotification({
                endpoint: sub.endpoint,
                keys: {
                    p256dh: sub.p256dh,
                    auth: sub.auth
                }
            }, payload);

            sent++;
        } catch (error) {
            failed++;

            const message =
                `${error.statusCode || ""} ${error.message || error}`;

            const detail = error.body
                ? String(error.body)
                : "";

            console.error(
                "Erreur notification réservation:",
                message,
                detail
            );

            errors.push(
                detail ? `${message} — ${detail}` : message
            );

            if (
                error.statusCode === 404 ||
                error.statusCode === 410 ||
                (
                    error.statusCode === 400 &&
                    String(error.body || "").includes("VapidPkHashMismatch")
                )
            ) {
                await sql`
                    DELETE FROM push_subscriptions
                    WHERE endpoint = ${sub.endpoint}
                `;
            }
        }
    }

    return {
        subscriptions: subscriptions.length,
        sent,
        failed,
        errors
    };
}

export async function sendAssistantReminderPush(reminder) {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;

    if (!publicKey || !privateKey) {
        throw new Error("Clés VAPID absentes.");
    }

    webpush.setVapidDetails(
        "mailto:nicolas@atelierdugoutaulnay.com",
        publicKey,
        privateKey
    );

    const sql = db();

    const subscriptions = await sql`
        SELECT endpoint, p256dh, auth
        FROM push_subscriptions
    `;

    const payload = JSON.stringify({
        title: "⏰ Rappel — L'Atelier du Goût",
        body: reminder.title,
        url: "/admin/"
    });

    let sent = 0;
    let failed = 0;
    const errors = [];

    for (const sub of subscriptions) {
        try {
            await webpush.sendNotification({
                endpoint: sub.endpoint,
                keys: {
                    p256dh: sub.p256dh,
                    auth: sub.auth
                }
            }, payload);

            sent++;
        } catch (error) {
            failed++;

            const message =
                `${error.statusCode || ""} ${error.message || error}`;

            const detail = error.body
                ? String(error.body)
                : "";

            console.error(
                "Erreur notification rappel:",
                message,
                detail
            );

            errors.push(
                detail ? `${message} — ${detail}` : message
            );

            if (
                error.statusCode === 404 ||
                error.statusCode === 410 ||
                (
                    error.statusCode === 400 &&
                    String(error.body || "").includes("VapidPkHashMismatch")
                )
            ) {
                await sql`
                    DELETE FROM push_subscriptions
                    WHERE endpoint = ${sub.endpoint}
                `;
            }
        }
    }

    return {
        subscriptions: subscriptions.length,
        sent,
        failed,
        errors
    };
}
