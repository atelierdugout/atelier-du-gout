import { db } from "./db.mjs";
import { sendReservationConfirmation } from "./reservation-emails.mjs";
import { sendNewReservationPush } from "./push-notification.mjs";
import {
  rateLimit,
  rateLimitResponse,
  bodyTooLarge,
  securityEvent
} from "./security-guard.mjs";

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

const clean = (value, max = 500) =>
  String(value || "").trim().slice(0, max);

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validPhone(value) {
  return /^[0-9+().\s-]{8,30}$/.test(value);
}

function serviceForTime(time, settings) {
  const lunch = settings.slots?.lunch || [];
  const dinner = settings.slots?.dinner || [];

  if (lunch.includes(time)) return "lunch";
  if (dinner.includes(time)) return "dinner";

  return null;
}

export default async (req) => {
  if (req.method !== "POST") {
    return reply({ error: "Méthode non autorisée." }, 405);
  }

  if (bodyTooLarge(req, 25_000)) {
    return reply({ error: "Requête trop volumineuse." }, 413);
  }

  const reservationLimit = rateLimit(req, {
    namespace: "reservation-create",
    limit: 10,
    windowMs: 15 * 60 * 1000
  });

  if (!reservationLimit.allowed) {
    securityEvent(
      "reservation_rate_limited",
      "",
      "Trop de créations de réservation"
    );

    return rateLimitResponse(reservationLimit);
  }

  let body;

  try {
    body = await req.json();
  } catch {
    return reply({ error: "Requête invalide." }, 400);
  }

  // Champ invisible destiné aux robots.
  if (body?.website) {
    return reply({ success: true });
  }

  const reservationDate = clean(body?.date, 10);
  const reservationTime = clean(body?.time, 5);
  const customerName = clean(body?.name, 120);
  const customerEmail = clean(body?.email, 200).toLowerCase();
  const customerPhone = clean(body?.phone, 40);
  const notes = clean(body?.notes, 1000);
  const allergies = clean(body?.allergies, 1000);
  const partySize = Number.parseInt(body?.party_size, 10);
  const requestToken = clean(body?.request_token, 100);

  if (
    !requestToken ||
    !/^[A-Za-z0-9_-]{16,100}$/.test(requestToken)
  ) {
    return reply({ error: "Identifiant de réservation invalide." }, 400);
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(reservationDate)) {
    return reply({ error: "Date invalide." }, 400);
  }

  if (!/^\d{2}:\d{2}$/.test(reservationTime)) {
    return reply({ error: "Horaire invalide." }, 400);
  }

  if (!customerName) {
    return reply({ error: "Votre nom est obligatoire." }, 400);
  }

  if (!validEmail(customerEmail)) {
    return reply({ error: "Adresse e-mail invalide." }, 400);
  }

  if (!validPhone(customerPhone)) {
    return reply({ error: "Numéro de téléphone invalide." }, 400);
  }

  if (!Number.isInteger(partySize)) {
    return reply({ error: "Nombre de personnes invalide." }, 400);
  }

  const sql = db();

  try {
    const settingsRow = (await sql`
      SELECT settings
      FROM site_settings
      WHERE id = 'reservations'
      LIMIT 1
    `)[0];

    const settings = settingsRow?.settings || {};

    if (settings.enabled === false) {
      return reply({
        error: "Les réservations en ligne sont momentanément fermées."
      }, 409);
    }

    const minParty = Math.max(
      1,
      Number(settings.min_party_size || 1)
    );

    const maxParty = Math.max(
      minParty,
      Number(settings.max_party_size || 10)
    );

    if (partySize < minParty || partySize > maxParty) {
      return reply({
        error: `Les réservations en ligne sont possibles de ${minParty} à ${maxParty} personnes.`
      }, 400);
    }

    const now = new Date();

    const parisParts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Paris",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    }).formatToParts(now);

    const paris = Object.fromEntries(
      parisParts
        .filter(part => part.type !== "literal")
        .map(part => [part.type, part.value])
    );

    const todayParis =
      `${paris.year}-${paris.month}-${paris.day}`;

    if (reservationDate < todayParis) {
      return reply({
        error: "Cette date est déjà passée."
      }, 400);
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

    if (reservationDate > maximumDate) {
      return reply({
        error:
          `Les réservations sont ouvertes jusqu'à ${advanceDays} jours à l'avance.`
      }, 400);
    }

    const minimumNoticeMinutes = Math.max(
      0,
      Number(settings.minimum_notice_minutes ?? 60)
    );

    if (reservationDate === todayParis) {
      const [slotHour, slotMinute] =
        reservationTime.split(":").map(Number);

      const slotMinutes =
        slotHour * 60 + slotMinute;

      const currentMinutes =
        Number(paris.hour) * 60 +
        Number(paris.minute);

      if (
        slotMinutes - currentMinutes <
        minimumNoticeMinutes
      ) {
        return reply({
          error:
            minimumNoticeMinutes === 60
              ? "Cette réservation doit être effectuée au moins 1 heure à l'avance."
              : `Cette réservation doit être effectuée au moins ${minimumNoticeMinutes} minutes à l'avance.`
        }, 409);
      }
    }

    const closedDates = Array.isArray(settings.closed_dates)
      ? settings.closed_dates
      : [];

    if (closedDates.includes(reservationDate)) {
      return reply({
        error: "Le restaurant est fermé aux réservations à cette date."
      }, 409);
    }

    const date = new Date(`${reservationDate}T12:00:00Z`);

    if (Number.isNaN(date.getTime())) {
      return reply({ error: "Date invalide." }, 400);
    }

    const dayName = DAYS[date.getUTCDay()];
    const service = serviceForTime(reservationTime, settings);

    if (!service) {
      return reply({
        error: "Cet horaire n'est pas disponible."
      }, 409);
    }

    const servicesForDay = settings.weekly?.[dayName] || [];

    if (
      !Array.isArray(servicesForDay) ||
      !servicesForDay.includes(service)
    ) {
      return reply({
        error: "Le restaurant n'accepte pas de réservation sur ce service."
      }, 409);
    }

    const capacity = Math.max(
      1,
      Number(settings.service_capacity?.[service] || 10)
    );

    const reservationRef =
      `RESA-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

    let rows;

    try {
      rows = await sql`
        SELECT
          (reservation).*,
          created
        FROM create_restaurant_reservation(
          ${reservationRef},
          ${reservationDate}::date,
          ${reservationTime}::time,
          ${partySize},
          ${customerName},
          ${customerEmail},
          ${customerPhone},
          ${notes},
          ${allergies},
          ${service},
          ${capacity},
          ${requestToken}
        )
      `;
    } catch (error) {
      const message = String(error?.message || error);

      if (message.includes("SERVICE_FULL")) {
        return reply({
          error: "Ce service est complet. Choisissez une autre date ou un autre service."
        }, 409);
      }

      if (message.includes("INVALID_PARTY_SIZE")) {
        return reply({
          error: "Nombre de personnes invalide."
        }, 400);
      }

      console.error("Création réservation SQL :", error);

      return reply({
        error: "Impossible d'enregistrer la réservation."
      }, 500);
    }

    const reservation = rows?.[0];

    if (!reservation) {
      return reply({
        error: "Impossible d'enregistrer la réservation."
      }, 500);
    }

    const wasCreated = reservation.created === true;

    if (!wasCreated) {
      return reply({
        success: true,
        reservation_ref: reservation.reservation_ref,
        date: reservation.reservation_date,
        time: String(reservation.reservation_time).slice(0, 5),
        party_size: reservation.party_size,
        duplicate_request: true,
        email_sent: Boolean(reservation.confirmation_email_sent_at),
        push_sent: false
      });
    }

    let emailSent = false;
    let pushSent = false;

    try {
      await sendReservationConfirmation(reservation);

      await sql`
        UPDATE reservations
        SET confirmation_email_sent_at = NOW(),
            updated_at = NOW()
        WHERE id = ${reservation.id}
      `;

      emailSent = true;
    } catch (error) {
      console.error("E-mail réservation :", error);
    }

    try {
      const push = await sendNewReservationPush(reservation);
      pushSent = Number(push?.sent || 0) > 0;
    } catch (error) {
      console.error("Push réservation :", error);
    }

    return reply({
      success: true,
      reservation_ref: reservation.reservation_ref,
      date: reservation.reservation_date,
      time: String(reservation.reservation_time).slice(0, 5),
      party_size: reservation.party_size,
      email_sent: emailSent,
      push_sent: pushSent
    }, 201);

  } catch (error) {
    console.error("create-reservation:", error);

    return reply({
      error: "Impossible de traiter la réservation."
    }, 500);
  }
};
