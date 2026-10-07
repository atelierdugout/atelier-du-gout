import { db } from './db.mjs';
import { hasAdminAccess } from "./admin-session.mjs";

const reply = (data, status = 200) =>
  Response.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store' }
  });

async function getAccounts(sql) {
  const accounts = await sql`
    SELECT
      a.id,
      a.email,
      a.name,
      a.points,
      a.created_at,
      a.updated_at,
      COUNT(l.id)::int AS movement_count,
      COALESCE(
        SUM(
          CASE
            WHEN l.event_type = 'order_earned'
            THEN l.points
            ELSE 0
          END
        ),
        0
      )::int AS earned_from_orders,
      MAX(l.created_at) AS last_activity
    FROM loyalty_accounts a
    LEFT JOIN loyalty_ledger l
      ON l.account_id = a.id
    GROUP BY
      a.id,
      a.email,
      a.name,
      a.points,
      a.created_at,
      a.updated_at
    ORDER BY a.updated_at DESC
    LIMIT 500
  `;

  const accountIds = accounts.map(account => Number(account.id));

  if (!accountIds.length) {
    return [];
  }

  const ledger = await sql`
    SELECT
      id,
      account_id,
      event_type,
      points,
      order_id,
      order_ref,
      note,
      created_at
    FROM (
      SELECT
        l.*,
        ROW_NUMBER() OVER (
          PARTITION BY l.account_id
          ORDER BY l.created_at DESC, l.id DESC
        ) AS row_number
      FROM loyalty_ledger l
      WHERE l.account_id = ANY(${accountIds})
    ) ranked
    WHERE row_number <= 50
    ORDER BY created_at DESC, id DESC
  `;

  const historyByAccount = new Map();

  for (const entry of ledger) {
    const key = String(entry.account_id);

    if (!historyByAccount.has(key)) {
      historyByAccount.set(key, []);
    }

    historyByAccount.get(key).push(entry);
  }

  return accounts.map(account => ({
    ...account,
    history: historyByAccount.get(String(account.id)) || []
  }));
}

export default async req => {
  if (!hasAdminAccess(req)) {
    return reply(
      { error: 'Authentification administrateur requise.' },
      401
    );
  }

  try {
    const sql = db();

    if (req.method === 'GET') {
      return reply({
        ok: true,
        accounts: await getAccounts(sql)
      });
    }

    if (req.method === 'POST') {
      let body;

      try {
        body = await req.json();
      } catch {
        return reply({ error: 'Requête invalide.' }, 400);
      }

      const accountId = Number(body.account_id);
      const adjustment = Number(body.points);
      const note = String(body.note || '').trim();

      if (!Number.isSafeInteger(accountId) || accountId <= 0) {
        return reply({ error: 'Compte fidélité invalide.' }, 400);
      }

      if (
        !Number.isSafeInteger(adjustment) ||
        adjustment === 0 ||
        Math.abs(adjustment) > 100000
      ) {
        return reply({ error: 'Nombre de points invalide.' }, 400);
      }

      if (!note) {
        return reply(
          { error: 'Le motif de la correction est obligatoire.' },
          400
        );
      }

      if (note.length > 250) {
        return reply({ error: 'Le motif est trop long.' }, 400);
      }

      try {
        const rows = await sql`
          SELECT *
          FROM admin_adjust_loyalty_points(
            ${accountId},
            ${adjustment},
            ${note}
          )
        `;

        if (!rows[0]) {
          throw new Error('ADJUSTMENT_FAILED');
        }

        return reply({
          ok: true,
          account: rows[0]
        });

      } catch (error) {
        const message = String(error?.message || '');

        if (message.includes('ACCOUNT_NOT_FOUND')) {
          return reply(
            { error: 'Compte fidélité introuvable.' },
            404
          );
        }

        if (message.includes('INSUFFICIENT_POINTS')) {
          const match = message.match(/INSUFFICIENT_POINTS:(\d+)/);
          const currentPoints = match ? Number(match[1]) : null;

          return reply({
            error:
              currentPoints !== null
                ? `Correction impossible : le solde actuel est de ${currentPoints} points.`
                : 'Correction impossible : solde de points insuffisant.'
          }, 409);
        }

        if (
          message.includes('INVALID_ADJUSTMENT') ||
          message.includes('INVALID_NOTE')
        ) {
          return reply(
            { error: 'Correction fidélité invalide.' },
            400
          );
        }

        throw error;
      }
    }

    return reply({ error: 'Méthode non autorisée.' }, 405);

  } catch (error) {
    console.error(error);

    return reply({
      error: 'Impossible de gérer la fidélité.'
    }, 500);
  }
};
