import { db } from "./db.mjs";

const reply = (data, status = 200) =>
  Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" }
  });

const DAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday"
];

export default async (req) => {
  if (req.method !== "GET") {
    return reply({ error: "Méthode non autorisée." }, 405);
  }

  try {
    const url = new URL(req.url);
    const dateValue = String(url.searchParams.get("date") || "");
    const requestedParty = Math.max(
      1,
      Number.parseInt(url.searchParams.get("party_size") || "1", 10)
    );

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
      return reply({ error: "Date invalide." }, 400);
    }

    const sql = db();

    const settingsRow = (await sql`
      SELECT settings
      FROM site_settings
      WHERE id = 'reservations'
      LIMIT 1
    `)[0];

    const settings = settingsRow?.settings || {};

    if (settings.enabled === false) {
      return reply({
        available: false,
        reason: "closed",
        services: []
      });
    }

    const maxParty = Math.max(
      1,
      Number(settings.max_party_size || 10)
    );

    if (requestedParty > maxParty) {
      return reply({
        available: false,
        reason: "party_too_large",
        services: []
      });
    }

    const closedDates = Array.isArray(settings.closed_dates)
      ? settings.closed_dates
      : [];

    if (closedDates.includes(dateValue)) {
      return reply({
        available: false,
        reason: "closed",
        services: []
      });
    }

    const date = new Date(`${dateValue}T12:00:00Z`);

    if (Number.isNaN(date.getTime())) {
      return reply({ error: "Date invalide." }, 400);
    }

    const dayName = DAYS[date.getUTCDay()];
    const enabledServices = Array.isArray(settings.weekly?.[dayName])
      ? settings.weekly[dayName]
      : [];

    const totals = await sql`
      SELECT
        CASE
          WHEN reservation_time >= TIME '11:00'
           AND reservation_time < TIME '16:00'
            THEN 'lunch'
          WHEN reservation_time >= TIME '17:00'
           AND reservation_time < TIME '23:00'
            THEN 'dinner'
          ELSE 'other'
        END AS service,
        COALESCE(SUM(party_size), 0)::int AS guests
      FROM reservations
      WHERE reservation_date = ${dateValue}::date
        AND status IN ('confirmed', 'seated')
      GROUP BY 1
    `;

    const reserved = {
      lunch: 0,
      dinner: 0
    };

    for (const row of totals) {
      if (row.service === "lunch" || row.service === "dinner") {
        reserved[row.service] = Number(row.guests || 0);
      }
    }

    const services = [];

    const minimumNoticeMinutes = Math.max(
      0,
      Number(settings.minimum_notice_minutes ?? 60)
    );

    const nowParisParts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Paris",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    }).formatToParts(new Date());

    const paris = Object.fromEntries(
      nowParisParts
        .filter(part => part.type !== "literal")
        .map(part => [part.type, part.value])
    );

    const todayParis =
      `${paris.year}-${paris.month}-${paris.day}`;

    const currentMinutes =
      Number(paris.hour) * 60 + Number(paris.minute);

    if (dateValue < todayParis) {
      return reply({
        available: false,
        reason: "past_date",
        date: dateValue,
        party_size: requestedParty,
        services: []
      });
    }

    const advanceDays = Math.max(
      1,
      Number(settings.advance_booking_days || 60)
    );

    const todayUtc = new Date(
      `${todayParis}T12:00:00Z`
    );

    const maximumUtc = new Date(todayUtc);

    maximumUtc.setUTCDate(
      maximumUtc.getUTCDate() + advanceDays
    );

    const maximumDate =
      maximumUtc.toISOString().slice(0, 10);

    if (dateValue > maximumDate) {
      return reply({
        available: false,
        reason: "too_far",
        date: dateValue,
        party_size: requestedParty,
        services: []
      });
    }

    for (const service of ["lunch", "dinner"]) {
      if (!enabledServices.includes(service)) continue;

      const capacity = Math.max(
        1,
        Number(settings.service_capacity?.[service] || 10)
      );

      const remaining = Math.max(
        0,
        capacity - Number(reserved[service] || 0)
      );

      const configuredSlots = Array.isArray(settings.slots?.[service])
        ? settings.slots[service]
        : [];

      const availableSlots = configuredSlots.filter(slot => {
        if (dateValue !== todayParis) return true;

        const [hour, minute] = String(slot)
          .split(":")
          .map(Number);

        const slotMinutes = hour * 60 + minute;

        return (
          slotMinutes - currentMinutes >=
          minimumNoticeMinutes
        );
      });

      services.push({
        service,
        capacity,
        reserved: reserved[service],
        remaining,
        available:
          remaining >= requestedParty &&
          availableSlots.length > 0,
        slots:
          remaining >= requestedParty
            ? availableSlots
            : []
      });
    }

    return reply({
      available: services.some(service => service.available),
      date: dateValue,
      party_size: requestedParty,
      services
    });

  } catch (error) {
    console.error("reservation-availability:", error);

    return reply({
      error: "Impossible de vérifier les disponibilités."
    }, 500);
  }
};
