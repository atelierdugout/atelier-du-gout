import { db } from './db.mjs';
import { hasAdminAccess } from "./admin-session.mjs";
import { sendReadyEmail } from "./order-emails.mjs";

const reply = (data, status = 200) =>
  Response.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store' }
  });

const auth = (req) => hasAdminAccess(req);

const allowed = new Set(['new', 'preparing', 'ready', 'completed']);

export default async (req) => {
  if (!auth(req)) {
    return reply({
      error: "Authentification administrateur requise."
    }, 401);
  }

  const sql = db();

  if (req.method === 'GET') {
    const u = new URL(req.url);
    const scope = u.searchParams.get('scope') || 'upcoming';
    const mode = u.searchParams.get('mode') || 'all';

    let rows;

    if (scope === 'today') {
      rows = await sql`
        SELECT *
        FROM orders
        WHERE status IN ('paid','preparing','ready','completed')
          AND service_date = CURRENT_DATE::text
        ORDER BY service_slot NULLS LAST, created_at DESC
        LIMIT 200
      `;
    } else if (scope === 'all') {
      rows = await sql`
        SELECT *
        FROM orders
        WHERE status IN ('paid','preparing','ready','completed')
        ORDER BY service_date DESC NULLS LAST,
                 service_slot DESC NULLS LAST,
                 created_at DESC
        LIMIT 200
      `;
    } else {
      rows = await sql`
        SELECT *
        FROM orders
        WHERE status IN ('paid','preparing','ready','completed')
          AND COALESCE(fulfillment_status, 'new') <> 'completed'
          AND (service_date IS NULL OR service_date >= CURRENT_DATE::text)
        ORDER BY service_date NULLS LAST,
                 service_slot NULLS LAST,
                 created_at DESC
        LIMIT 200
      `;
    }

    if (mode !== 'all') {
      rows = rows.filter((r) => r.mode === mode);
    }

    const ids = rows.map((r) => r.id);
    let items = [];

    if (ids.length) {
      items = await sql`
        SELECT *
        FROM order_items
        WHERE order_id = ANY(${ids}::bigint[])
        ORDER BY order_id, id
      `;
    }

    const by = new Map();

    for (const item of items) {
      const key = String(item.order_id);
      if (!by.has(key)) by.set(key, []);
      by.get(key).push(item);
    }

    return reply({
      ok: true,
      orders: rows.map((order) => ({
        ...order,
        fulfillment_status: order.fulfillment_status || 'new',
        items: by.get(String(order.id)) || []
      }))
    });
  }

  if (req.method === 'POST') {
    let body;

    try {
      body = await req.json();
    } catch {
      return reply({ error: 'Requête invalide.' }, 400);
    }

    const id = Number(body.order_id);
    const status = String(body.status || '');

    if (!id || !allowed.has(status)) {
      return reply({ error: 'Statut ou commande invalide.' }, 400);
    }

    try {
      const result = await sql`
        UPDATE orders
        SET fulfillment_status = ${status}
        WHERE id = ${id}
        RETURNING id, order_ref, fulfillment_status, customer_email, customer_name, mode, service_date, service_slot
      `;

      if (!result.length) {
        return reply({ error: 'Commande introuvable.' }, 404);
      }

      if (status === 'ready' && result[0].customer_email) {
        try {
          await sendReadyEmail(sql, result[0]);
        } catch (emailErr) {
          console.error("ready-email", emailErr);
        }
      }

      return reply({
        ok: true,
        order: result[0]
      });
    } catch (err) {
      console.error(err);
      return reply({ error: err.message }, 500);
    }
  }

  return reply({ error: 'Méthode non autorisée.' }, 405);
};
