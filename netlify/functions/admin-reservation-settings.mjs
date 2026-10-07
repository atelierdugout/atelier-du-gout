import { db } from "./db.mjs";
import { hasAdminAccess } from "./admin-session.mjs";

const DAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday"
];

const SERVICES = ["lunch", "dinner"];

const reply = (data, status = 200) =>
  Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" }
  });

function integer(value, min, max, label) {
  const n = Number(value);

  if (!Number.isInteger(n) || n < min || n > max) {
    throw new Error(label);
  }

  return n;
}

function normalizeSlots(value, service) {
  if (!Array.isArray(value)) {
    throw new Error(`Horaires ${service} invalides.`);
  }

  const slots = [...new Set(
    value.map(v => String(v).trim())
  )];

  for (const slot of slots) {
    if (!/^\d{2}:\d{2}$/.test(slot)) {
      throw new Error(`Horaire invalide : ${slot}`);
    }

    const [hour, minute] = slot.split(":").map(Number);

    if (
      hour < 0 ||
      hour > 23 ||
      minute < 0 ||
      minute > 59
    ) {
      throw new Error(`Horaire invalide : ${slot}`);
    }

    if (
      service === "lunch" &&
      (hour < 11 || hour >= 16)
    ) {
      throw new Error(
        `L'horaire ${slot} n'appartient pas au service du midi.`
      );
    }

    if (
      service === "dinner" &&
      (hour < 17 || hour >= 23)
    ) {
      throw new Error(
        `L'horaire ${slot} n'appartient pas au service du soir.`
      );
    }
  }

  return slots.sort();
}

function normalizeSettings(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Configuration invalide.");
  }

  const weekly = {};

  for (const day of DAYS) {
    const services = Array.isArray(input.weekly?.[day])
      ? input.weekly[day]
      : [];

    weekly[day] = [
      ...new Set(
        services.filter(service =>
          SERVICES.includes(service)
        )
      )
    ];
  }

  const closedDates = Array.isArray(input.closed_dates)
    ? [...new Set(
        input.closed_dates.map(v => String(v).trim())
      )]
    : [];

  for (const date of closedDates) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new Error(`Date de fermeture invalide : ${date}`);
    }

    const parsed = new Date(`${date}T12:00:00Z`);

    if (
      Number.isNaN(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== date
    ) {
      throw new Error(`Date de fermeture invalide : ${date}`);
    }
  }

  const minParty = integer(
    input.min_party_size,
    1,
    50,
    "Nombre minimum de personnes invalide."
  );

  const maxParty = integer(
    input.max_party_size,
    minParty,
    50,
    "Nombre maximum de personnes invalide."
  );

  return {
    enabled: input.enabled !== false,

    service_capacity: {
      lunch: integer(
        input.service_capacity?.lunch,
        1,
        200,
        "Capacité du midi invalide."
      ),
      dinner: integer(
        input.service_capacity?.dinner,
        1,
        200,
        "Capacité du soir invalide."
      )
    },

    slots: {
      lunch: normalizeSlots(
        input.slots?.lunch,
        "lunch"
      ),
      dinner: normalizeSlots(
        input.slots?.dinner,
        "dinner"
      )
    },

    weekly,

    closed_dates: closedDates.sort(),

    min_party_size: minParty,
    max_party_size: maxParty,

    advance_booking_days: integer(
      input.advance_booking_days,
      1,
      365,
      "Délai maximal de réservation invalide."
    ),

    minimum_notice_minutes: integer(
      input.minimum_notice_minutes,
      0,
      10080,
      "Délai minimum de réservation invalide."
    )
  };
}

export default async (req) => {
  if (!hasAdminAccess(req)) {
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
        WHERE id = 'reservations'
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
          {
            error:
              error?.message ||
              "Configuration invalide."
          },
          400
        );
      }

      const rows = await sql`
        INSERT INTO site_settings (
          id,
          settings,
          updated_at
        )
        VALUES (
          'reservations',
          ${JSON.stringify(settings)}::jsonb,
          NOW()
        )
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
    console.error(
      "admin-reservation-settings:",
      error
    );

    return reply(
      {
        error:
          "Impossible de gérer les paramètres de réservation."
      },
      500
    );
  }
};
