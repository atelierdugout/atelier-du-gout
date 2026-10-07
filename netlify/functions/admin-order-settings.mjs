import { db } from "./db.mjs";
import { hasAdminAccess } from "./admin-session.mjs";

const reply = (data, status = 200) =>
  Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" }
  });

const auth = (req) => hasAdminAccess(req);

const DAYS = ["0", "1", "2", "3", "4", "5", "6"];
const TIME_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function normalizeSlots(value) {
  if (!Array.isArray(value)) return [];

  return [...new Set(
    value
      .map(value => String(value || "").trim())
      .filter(value => TIME_RE.test(value))
  )].sort();
}

function normalizeSettings(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw Object.assign(
      new Error("Configuration invalide."),
      { status: 400 }
    );
  }

  const maxOrders = Number(input.max_orders_per_slot);

  if (
    !Number.isInteger(maxOrders) ||
    maxOrders < 1 ||
    maxOrders > 99
  ) {
    throw Object.assign(
      new Error("La capacité doit être comprise entre 1 et 99 commandes."),
      { status: 400 }
    );
  }

  const weekly = {};

  for (const day of DAYS) {
    const config =
      input.weekly?.[day] &&
      typeof input.weekly[day] === "object" &&
      !Array.isArray(input.weekly[day])
        ? input.weekly[day]
        : {};

    weekly[day] = {
      pickup: normalizeSlots(config.pickup),
      delivery: normalizeSlots(config.delivery)
    };
  }

  const closed_dates = [...new Set(
    (Array.isArray(input.closed_dates) ? input.closed_dates : [])
      .map(value => String(value || "").trim())
      .filter(value => DATE_RE.test(value))
  )].sort();

  return {
    pickup_enabled: input.pickup_enabled !== false,
    delivery_enabled: input.delivery_enabled !== false,
    max_orders_per_slot: maxOrders,
    weekly,
    closed_dates
  };
}

export default async (req) => {
  if (!auth(req)) {
    return reply(
      { error: "Accès administrateur requis." },
      401
    );
  }

  try {
    const sql = db();

    if (req.method === "GET") {
      const rows = await sql`
        SELECT settings, updated_at
        FROM site_settings
        WHERE id = 'orders'
        LIMIT 1
      `;

      return reply({
        settings: rows[0]?.settings || {},
        updated_at: rows[0]?.updated_at || null
      });
    }

    if (req.method === "POST") {
      const body = await req.json();

      let settings;

      try {
        settings = normalizeSettings(body?.settings);
      } catch (error) {
        return reply(
          { error: error.message || "Configuration invalide." },
          error.status || 400
        );
      }

      const rows = await sql`
        INSERT INTO site_settings (id, settings, updated_at)
        VALUES ('orders', ${JSON.stringify(settings)}::jsonb, NOW())
        ON CONFLICT (id)
        DO UPDATE SET
          settings = EXCLUDED.settings,
          updated_at = NOW()
        RETURNING settings, updated_at
      `;

      return reply({
        success: true,
        settings: rows[0].settings,
        updated_at: rows[0].updated_at
      });
    }

    return reply(
      { error: "Méthode non autorisée." },
      405
    );
  } catch (error) {
    console.error("admin-order-settings:", error);

    return reply(
      { error: "Impossible d'enregistrer les créneaux." },
      500
    );
  }
};
