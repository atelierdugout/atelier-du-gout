import { db } from "./db.mjs";

const reply = (data, status = 200) =>
  Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" }
  });

export default async (req) => {
  if (req.method !== "GET") {
    return reply({ error: "Méthode non autorisée." }, 405);
  }

  try {
    const sql = db();

    const rows = await sql`
      SELECT settings, updated_at
      FROM site_settings
      WHERE id = 'orders'
      LIMIT 1
    `;

    const settings = rows[0]?.settings || {};
    const maxOrders = Math.max(
      1,
      Math.min(99, Number(settings.max_orders_per_slot || 6))
    );

    const fullRows = await sql`
      SELECT
        service_date,
        service_slot,
        mode,
        COUNT(*)::int AS count
      FROM orders
      WHERE (
        status IN ('paid','preparing','ready','completed')
        OR (
          status = 'pending_payment'
          AND (
            payment_expires_at IS NULL
            OR payment_expires_at > NOW()
          )
        )
      )
        AND service_date IS NOT NULL
        AND service_slot IS NOT NULL
        AND service_date >= CURRENT_DATE::text
      GROUP BY service_date, service_slot, mode
      HAVING COUNT(*) >= ${maxOrders}
    `;

    const full_slots = fullRows.map((row) => ({
      date: row.service_date,
      slot: row.service_slot,
      mode: row.mode
    }));

    return reply({
      settings: {
        ...settings,

        /*
         * Configuration publique de livraison.
         * Le serveur create-payment reste l'autorité finale.
         */
        delivery_minimum: 20,

        delivery_zones: [
          {
            key: "aulnay",
            label: "Aulnay-de-Saintonge",
            fee: 3.5
          },
          {
            key: "10km",
            label: "Jusqu’à 10 km",
            fee: 5
          },
          {
            key: "10-15km",
            label: "10 à 15 km",
            fee: 7.5
          }
        ]
      },

      full_slots,
      updated_at: rows[0]?.updated_at || null
    });
  } catch (error) {
    console.error("order-settings:", error);
    return reply({ error: "Impossible de charger les créneaux." }, 500);
  }
};
