import { db } from "./db.mjs";
import { hasAdminAccess } from "./admin-session.mjs";

const reply = (data, status = 200) =>
    Response.json(data, {
        status,
        headers: { "Cache-Control": "no-store" }
    });

export default async (req) => {
    if (req.method !== "POST") {
        return reply({ error: "Method not allowed" }, 405);
    }

    if (!hasAdminAccess(req)) {
        return reply({ error: "Authentification administrateur requise." }, 401);
    }

    try {
        const subscription = await req.json();

        if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
            return reply({ error: "Abonnement push invalide." }, 400);
        }

        const sql = db();

        await sql`
            CREATE TABLE IF NOT EXISTS push_subscriptions (
                id BIGSERIAL PRIMARY KEY,
                endpoint TEXT UNIQUE NOT NULL,
                p256dh TEXT NOT NULL,
                auth TEXT NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        `;

        await sql`DELETE FROM push_subscriptions`;

        await sql`
            INSERT INTO push_subscriptions (endpoint, p256dh, auth)
            VALUES (
                ${subscription.endpoint},
                ${subscription.keys.p256dh},
                ${subscription.keys.auth}
            )
        `;

        return reply({ ok: true });
    } catch (error) {
        console.error("Push subscription:", error);
        return reply({ error: "Impossible d'enregistrer les notifications." }, 500);
    }
};
