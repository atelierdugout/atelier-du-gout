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
      SELECT settings
      FROM site_settings
      WHERE id = 'reservations'
      LIMIT 1
    `;

    const settings = rows[0]?.settings || {};

    return reply({
      enabled: settings.enabled !== false,
      service_capacity: settings.service_capacity || {
        lunch: 10,
        dinner: 10
      },
      slots: settings.slots || {
        lunch: ["12:00", "12:30", "13:00", "13:30"],
        dinner: ["18:30", "19:00", "19:30", "20:00", "20:30"]
      },
      weekly: settings.weekly || {},
      closed_dates: Array.isArray(settings.closed_dates)
        ? settings.closed_dates
        : [],
      min_party_size: Number(settings.min_party_size || 1),
      max_party_size: Number(settings.max_party_size || 10),
      advance_booking_days: Number(settings.advance_booking_days || 60),
      minimum_notice_minutes: Math.max(0, Number(settings.minimum_notice_minutes ?? 60)),
    });
  } catch (error) {
    console.error("reservation-settings:", error);

    return reply(
      { error: "Impossible de charger les disponibilités." },
      500
    );
  }
};
