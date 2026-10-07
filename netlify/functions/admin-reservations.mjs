import { db } from "./db.mjs";
import { hasAdminAccess } from "./admin-session.mjs";
import { sendReservationConfirmation } from "./reservation-emails.mjs";
import { sendNewReservationPush } from "./push-notification.mjs";

const reply = (data, status = 200) =>
  Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" }
  });

const ALLOWED_STATUSES = new Set([
  "confirmed",
  "seated",
  "completed",
  "cancelled",
  "no_show"
]);

const ALLOWED_SOURCES = new Set([
  "website",
  "phone",
  "walk_in",
  "admin"
]);

const clean = (value, max = 1000) =>
  String(value ?? "").trim().slice(0, max);


function serviceForTime(time, settings) {
  const lunch = settings.slots?.lunch || [];
  const dinner = settings.slots?.dinner || [];

  if (lunch.includes(time)) return "lunch";
  if (dinner.includes(time)) return "dinner";

  return null;
}

export default async (req) => {
  if (!hasAdminAccess(req)) {
    return reply({ error: "Accès administrateur requis." }, 401);
  }

  const sql = db();

  try {
    if (req.method === "GET") {
      const url = new URL(req.url);
      const scope = clean(url.searchParams.get("scope") || "upcoming", 20);

      let rows;

      if (scope === "today") {
        rows = await sql`
          SELECT *
          FROM reservations
          WHERE reservation_date =
            (NOW() AT TIME ZONE 'Europe/Paris')::date
          ORDER BY reservation_time ASC, created_at ASC
        `;
      } else if (scope === "all") {
        rows = await sql`
          SELECT *
          FROM reservations
          ORDER BY reservation_date DESC,
                   reservation_time DESC,
                   created_at DESC
          LIMIT 500
        `;
      } else {
        rows = await sql`
          SELECT *
          FROM reservations
          WHERE reservation_date >=
            (NOW() AT TIME ZONE 'Europe/Paris')::date
            AND status NOT IN ('cancelled', 'completed', 'no_show')
          ORDER BY reservation_date ASC,
                   reservation_time ASC,
                   created_at ASC
          LIMIT 500
        `;
      }

      return reply({
        reservations: rows
      });
    }

    if (req.method === "POST") {
      const body = await req.json();
      const action = clean(body?.action, 30);

      if (action === "status") {
        const id = Number.parseInt(body?.reservation_id, 10);
        const status = clean(body?.status, 30);

        if (!Number.isInteger(id) || id < 1) {
          return reply({ error: "Réservation invalide." }, 400);
        }

        if (!ALLOWED_STATUSES.has(status)) {
          return reply({ error: "Statut invalide." }, 400);
        }

        const rows = await sql`
          UPDATE reservations
          SET status = ${status},
              updated_at = NOW()
          WHERE id = ${id}
          RETURNING *
        `;

        if (!rows[0]) {
          return reply({ error: "Réservation introuvable." }, 404);
        }

        return reply({
          success: true,
          reservation: rows[0]
        });
      }

      if (action === "update") {
        const id = Number.parseInt(body?.reservation_id, 10);
        const date = clean(body?.date, 10);
        const time = clean(body?.time, 5);
        const partySize = Number.parseInt(body?.party_size, 10);
        const name = clean(body?.name, 120);
        const phone = clean(body?.phone, 40);
        const email = clean(body?.email, 200).toLowerCase();
        const notes = clean(body?.notes, 1000);
        const allergies = clean(body?.allergies, 1000);

        if (!Number.isInteger(id) || id < 1) {
          return reply({ error: "Réservation invalide." }, 400);
        }

        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          return reply({ error: "Date invalide." }, 400);
        }

        if (!/^\d{2}:\d{2}$/.test(time)) {
          return reply({ error: "Horaire invalide." }, 400);
        }

        if (!Number.isInteger(partySize) || partySize < 1) {
          return reply({ error: "Nombre de personnes invalide." }, 400);
        }

        if (!name || !phone) {
          return reply({
            error: "Nom et téléphone obligatoires."
          }, 400);
        }

        const rows = await sql`
          UPDATE reservations
          SET reservation_date = ${date}::date,
              reservation_time = ${time}::time,
              party_size = ${partySize},
              customer_name = ${name},
              customer_phone = ${phone},
              customer_email = ${email || null},
              notes = ${notes || null},
              allergies = ${allergies || null},
              updated_at = NOW()
          WHERE id = ${id}
          RETURNING *
        `;

        if (!rows[0]) {
          return reply({ error: "Réservation introuvable." }, 404);
        }

        return reply({
          success: true,
          reservation: rows[0]
        });
      }

      if (action === "create") {
        const date = clean(body?.date, 10);
        const time = clean(body?.time, 5);
        const partySize = Number.parseInt(body?.party_size, 10);
        const name = clean(body?.name, 120);
        const phone = clean(body?.phone, 40);
        const email = clean(body?.email, 200).toLowerCase();
        const notes = clean(body?.notes, 1000);
        const allergies = clean(body?.allergies, 1000);
        const source = ALLOWED_SOURCES.has(body?.source)
          ? body.source
          : "admin";

        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          return reply({ error: "Date invalide." }, 400);
        }

        if (!/^\d{2}:\d{2}$/.test(time)) {
          return reply({ error: "Horaire invalide." }, 400);
        }

        if (!Number.isInteger(partySize) || partySize < 1) {
          return reply({ error: "Nombre de personnes invalide." }, 400);
        }

        if (!name || !phone) {
          return reply({
            error: "Nom et téléphone obligatoires."
          }, 400);
        }

        const settingsRow = (await sql`
          SELECT settings
          FROM site_settings
          WHERE id = 'reservations'
          LIMIT 1
        `)[0];

        const settings = settingsRow?.settings || {};

        const minParty = Math.max(
          1,
          Number(settings.min_party_size || 1)
        );

        const maxParty = Math.max(
          minParty,
          Number(settings.max_party_size || 10)
        );

        if (
          partySize < minParty ||
          partySize > maxParty
        ) {
          return reply({
            error:
              `Le nombre de personnes doit être compris entre ${minParty} et ${maxParty}.`
          }, 400);
        }

        const service = serviceForTime(time, settings);

        if (!service) {
          return reply({
            error:
              "Cet horaire n'appartient à aucun créneau de réservation configuré."
          }, 409);
        }

        const capacity = Math.max(
          1,
          Number(
            settings.service_capacity?.[service] || 10
          )
        );

        const ref =
          `RESA-${Date.now()}-${Math.random()
            .toString(36)
            .slice(2, 6)
            .toUpperCase()}`;

        const requestToken =
          `admin_${Date.now()}_${Math.random()
            .toString(36)
            .slice(2, 14)}`;

        let rows;

        try {
          rows = await sql`
            SELECT
              (reservation).*,
              created
            FROM create_restaurant_reservation(
              ${ref},
              ${date}::date,
              ${time}::time,
              ${partySize},
              ${name},
              ${email || ""},
              ${phone},
              ${notes},
              ${allergies},
              ${service},
              ${capacity},
              ${requestToken}
            )
          `;
        } catch (error) {
          const message =
            String(error?.message || error);

          if (message.includes("SERVICE_FULL")) {
            return reply({
              error:
                "Ce service est complet. Augmentez sa capacité ou choisissez un autre service."
            }, 409);
          }

          if (
            message.includes("INVALID_PARTY_SIZE")
          ) {
            return reply({
              error: "Nombre de personnes invalide."
            }, 400);
          }

          throw error;
        }

        const reservation = rows?.[0];

        if (!reservation) {
          return reply({
            error:
              "Impossible d'enregistrer la réservation."
          }, 500);
        }

        delete reservation.created;

        /*
         * La fonction atomique crée la réservation avec
         * source web. L'admin conserve ici la provenance
         * réellement sélectionnée.
         */
        const sourceRows = await sql`
          UPDATE reservations
          SET source = ${source},
              updated_at = NOW()
          WHERE id = ${reservation.id}
          RETURNING *
        `;

        Object.assign(
          reservation,
          sourceRows[0] || {}
        );
        let emailSent = false;
        let pushSent = false;

        if (reservation?.customer_email) {
          try {
            await sendReservationConfirmation(reservation);

            await sql`
              UPDATE reservations
              SET confirmation_email_sent_at = NOW(),
                  updated_at = NOW()
              WHERE id = ${reservation.id}
            `;

            reservation.confirmation_email_sent_at =
              new Date().toISOString();

            emailSent = true;
          } catch (error) {
            console.error(
              "E-mail réservation admin :",
              error
            );
          }
        }

        try {
          const push =
            await sendNewReservationPush(reservation);

          pushSent =
            Number(push?.sent || 0) > 0;
        } catch (error) {
          console.error(
            "Push réservation admin :",
            error
          );
        }

        return reply({
          success: true,
          reservation,
          email_sent: emailSent,
          push_sent: pushSent
        }, 201);
      }

      return reply({ error: "Action invalide." }, 400);
    }

    return reply({ error: "Méthode non autorisée." }, 405);

  } catch (error) {
    console.error("admin-reservations:", error);

    return reply({
      error: "Impossible de gérer les réservations."
    }, 500);
  }
};
