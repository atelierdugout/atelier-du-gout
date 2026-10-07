import { db } from "./db.mjs";
import { hasAdminAccess } from "./admin-session.mjs";

const reply = (data, status = 200) =>
  Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });

const number = value => Number(value || 0);

const hhmm = value =>
  value ? String(value).slice(0, 5) : null;

export default async req => {
  if (!hasAdminAccess(req)) {
    return reply(
      { error: "Authentification administrateur requise." },
      401
    );
  }

  if (req.method !== "GET") {
    return reply({ error: "Méthode non autorisée." }, 405);
  }

  try {
    const sql = db();

    const [
      salesRows,
      orderRows,
      reservationRows,
      haccpRows,
      nextOrderRows,
      nextReservationRows,
      nextHaccpRows
    ] = await Promise.all([

      sql`
        SELECT
          COUNT(*)::int AS order_count,
          COALESCE(SUM(total_cents), 0)::bigint AS revenue_cents,
          COALESCE(AVG(total_cents), 0)::numeric AS average_order_cents
        FROM orders
        WHERE status IN ('paid','preparing','ready','completed')
          AND paid_at >= (
            (NOW() AT TIME ZONE 'Europe/Paris')::date
            AT TIME ZONE 'Europe/Paris'
          )
          AND paid_at < (
            (
              (NOW() AT TIME ZONE 'Europe/Paris')::date + 1
            )
            AT TIME ZONE 'Europe/Paris'
          )
      `,

      sql`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (
            WHERE COALESCE(fulfillment_status, 'new') <> 'completed'
          )::int AS remaining
        FROM orders
        WHERE status IN ('paid','preparing','ready','completed')
          AND service_date =
            (NOW() AT TIME ZONE 'Europe/Paris')::date::text
      `,

      sql`
        SELECT
          COUNT(*) FILTER (
            WHERE status NOT IN ('cancelled','no_show')
          )::int AS reservation_count,

          COALESCE(
            SUM(party_size) FILTER (
              WHERE status NOT IN ('cancelled','no_show')
            ),
            0
          )::int AS covers
        FROM reservations
        WHERE reservation_date =
          (NOW() AT TIME ZONE 'Europe/Paris')::date
      `,

      sql`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (
            WHERE status = 'done'
          )::int AS done,
          COUNT(*) FILTER (
            WHERE status = 'pending'
          )::int AS pending,
          COUNT(*) FILTER (
            WHERE status = 'skipped'
          )::int AS skipped
        FROM haccp_tasks
        WHERE scheduled_date =
          (NOW() AT TIME ZONE 'Europe/Paris')::date
      `,

      /* Prochaine commande non terminée aujourd'hui */
      sql`
        SELECT
          id,
          order_ref,
          customer_name,
          mode,
          service_slot,
          fulfillment_status
        FROM orders
        WHERE status IN ('paid','preparing','ready','completed')
          AND service_date =
            (NOW() AT TIME ZONE 'Europe/Paris')::date::text
          AND COALESCE(fulfillment_status, 'new') <> 'completed'
        ORDER BY
          service_slot NULLS LAST,
          created_at ASC
        LIMIT 1
      `,

      /* Prochaine réservation active d'aujourd'hui */
      sql`
        SELECT
          id,
          customer_name,
          reservation_time,
          party_size,
          status
        FROM reservations
        WHERE reservation_date =
          (NOW() AT TIME ZONE 'Europe/Paris')::date
          AND status NOT IN ('cancelled','completed','no_show')
        ORDER BY reservation_time ASC, created_at ASC
        LIMIT 1
      `,

      /* Prochaine tâche HACCP encore à faire */
      sql`
        SELECT
          id,
          task_type,
          title,
          scheduled_time,
          status
        FROM haccp_tasks
        WHERE scheduled_date =
          (NOW() AT TIME ZONE 'Europe/Paris')::date
          AND status = 'pending'
        ORDER BY scheduled_time ASC, equipment_id ASC
        LIMIT 1
      `
    ]);

    const sales = salesRows[0] || {};
    const orders = orderRows[0] || {};
    const reservations = reservationRows[0] || {};
    const haccp = haccpRows[0] || {};

    const nextOrder = nextOrderRows[0] || null;
    const nextReservation = nextReservationRows[0] || null;
    const nextHaccp = nextHaccpRows[0] || null;

    const priorities = [];

    if (number(haccp.pending) > 0) {
      priorities.push({
        type: "haccp",
        level: "attention",
        text:
          `${number(haccp.pending)} tâche` +
          `${number(haccp.pending) > 1 ? "s" : ""} HACCP à effectuer`,
        href: "hygiene.html"
      });
    }

    if (number(orders.remaining) > 0) {
      priorities.push({
        type: "orders",
        level: "attention",
        text:
          `${number(orders.remaining)} commande` +
          `${number(orders.remaining) > 1 ? "s" : ""} à traiter aujourd’hui`,
        href: "commandes.html"
      });
    }

    if (nextReservation) {
      priorities.push({
        type: "reservation",
        level: "info",
        text:
          `${number(nextReservation.party_size)} couvert` +
          `${number(nextReservation.party_size) > 1 ? "s" : ""}` +
          ` à ${hhmm(nextReservation.reservation_time) || "horaire à confirmer"}`,
        href: "reservations.html"
      });
    }

    if (!priorities.length) {
      priorities.push({
        type: "clear",
        level: "ok",
        text: "Aucune priorité opérationnelle détectée pour aujourd’hui.",
        href: null
      });
    }

    return reply({
      generated_at: new Date().toISOString(),

      sales: {
        revenue_cents: number(sales.revenue_cents),
        order_count: number(sales.order_count),
        average_order_cents:
          Math.round(number(sales.average_order_cents))
      },

      orders: {
        total: number(orders.total),
        remaining: number(orders.remaining)
      },

      reservations: {
        total: number(reservations.reservation_count),
        covers: number(reservations.covers)
      },

      haccp: {
        total: number(haccp.total),
        done: number(haccp.done),
        pending: number(haccp.pending),
        skipped: number(haccp.skipped)
      },

      next: {
        order: nextOrder
          ? {
              id: nextOrder.id,
              reference: nextOrder.order_ref,
              customer_name: nextOrder.customer_name || null,
              mode: nextOrder.mode || null,
              time: hhmm(nextOrder.service_slot),
              status: nextOrder.fulfillment_status || "new"
            }
          : null,

        reservation: nextReservation
          ? {
              id: nextReservation.id,
              customer_name: nextReservation.customer_name || null,
              time: hhmm(nextReservation.reservation_time),
              party_size: number(nextReservation.party_size),
              status: nextReservation.status
            }
          : null,

        haccp: nextHaccp
          ? {
              id: nextHaccp.id,
              type: nextHaccp.task_type,
              title: nextHaccp.title || "Tâche HACCP",
              time: hhmm(nextHaccp.scheduled_time),
              status: nextHaccp.status
            }
          : null
      },

      priorities
    });

  } catch (error) {
    console.error("admin-cockpit:", error);

    return reply(
      { error: "Impossible de charger le cockpit." },
      500
    );
  }
};
