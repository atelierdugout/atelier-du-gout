import { db } from './db.mjs';
import { hasAdminAccess } from "./admin-session.mjs";

const reply = (data, status = 200) =>
  Response.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store' }
  });

const auth = (req) => hasAdminAccess(req);

export default async (req) => {
  if (!auth(req)) {
    return reply({
      error: "Authentification administrateur requise."
    }, 401);
  }

  if (req.method !== 'GET') {
    return reply({ error: 'Méthode non autorisée.' }, 405);
  }

  try {
    const sql = db();

    const clients = await sql`
      SELECT
        LOWER(TRIM(o.customer_email)) AS email,
        MAX(o.customer_name) AS name,
        MAX(o.customer_phone) AS phone,
        COUNT(*)::int AS order_count,
        COALESCE(SUM(o.total_cents), 0)::bigint AS total_spent_cents,
        MAX(o.created_at) AS last_order_at,
        MAX(o.service_date) AS last_service_date,
        MAX(la.id) AS loyalty_account_id,
        COALESCE(MAX(la.points), 0)::int AS loyalty_points
      FROM orders o
      LEFT JOIN loyalty_accounts la
        ON LOWER(TRIM(la.email)) = LOWER(TRIM(o.customer_email))
      WHERE o.customer_email IS NOT NULL
        AND TRIM(o.customer_email) <> ''
        AND o.status IN ('paid','preparing','ready','completed')
      GROUP BY LOWER(TRIM(o.customer_email))
      ORDER BY MAX(o.created_at) DESC
      LIMIT 500
    `;

    return reply({
      ok: true,
      clients
    });

  } catch (err) {
    console.error(err);

    return reply({
      error: err.message
    }, 500);
  }
};
