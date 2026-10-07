import { hasAdminAccess } from "./admin-session.mjs";
import {
  getHygieneExpertMphSession,
  API_BASE
} from "./hygiene-expert-session.mjs";

const reply = (data, status = 200) =>
  Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });

function parisDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "long"
  }).formatToParts(date);

  return Object.fromEntries(
    parts
      .filter(p => p.type !== "literal")
      .map(p => [p.type, p.value])
  );
}

function dateString(parts) {
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function addDays(date, days) {
  return new Date(date.getTime() + days * 86400000);
}

function periodLabels(surface) {
  const periods = [];

  if (surface.morning) periods.push("Matin");
  if (surface.midday) periods.push("Midi");
  if (surface.evening) periods.push("Soir");

  return periods;
}

function scheduledToday(surface, weekday) {
  const key = weekday.toLowerCase();

  // Planning avec jours précis
  if (surface.weekly && surface[key] === true) {
    return true;
  }

  // Tâche hebdomadaire sans jour imposé :
  // on la garde disponible dans la liste hebdomadaire,
  // sans inventer un jour d'exécution.
  if (surface.weekly_without_date) {
    return true;
  }

  return false;
}

export default async req => {
  if (!hasAdminAccess(req)) {
    return reply({ error: "Non autorisé." }, 401);
  }

  if (req.method !== "GET") {
    return reply({ error: "Méthode non autorisée." }, 405);
  }

  try {
    const now = new Date();
    const todayParts = parisDateParts(now);
    const today = dateString(todayParts);

    // Fenêtre suffisamment large pour récupérer le planning autour d'aujourd'hui.
    const startParts = parisDateParts(addDays(now, -1));
    const endParts = parisDateParts(addDays(now, 1));

    const startDate = `${dateString(startParts)} 00:00:00`;
    const endDate = `${dateString(endParts)} 23:59:59`;

    const token = await getHygieneExpertMphSession();

    const url = new URL(
      "/mph/mph-planned-cleaning-surfaces",
      API_BASE
    );

    url.searchParams.set("startDate", startDate);
    url.searchParams.set("endDate", endDate);

    const response = await fetch(url, {
      headers: {
        Authorization: token,
        Accept: "application/json"
      },
      cache: "no-store"
    });

    if (!response.ok) {
      const body = await response.text();

      console.error(
        "Hygiène Expert cleaning planning:",
        response.status,
        body.slice(0, 500)
      );

      return reply(
        { error: "Impossible de charger le planning de nettoyage." },
        502
      );
    }

    const data = await response.json();

    const surfaces = Array.isArray(data?.plannedSurfaces)
      ? data.plannedSurfaces
      : [];

    const tasks = surfaces
      .filter(surface =>
        scheduledToday(surface, todayParts.weekday)
      )
      .map(surface => {
        const periods = periodLabels(surface);

        return {
          cleaning_surface_id: surface.cleaning_surface_id,
          frequency_id: surface.frequency_id,
          title: surface.cleaning_surface_label,
          zone_id: surface.zone_id,
          zone: surface.zone_label,
          periods,
          weekly_without_date:
            Boolean(surface.weekly_without_date),
          weekly_without_date_every_x_weeks:
            surface.weekly_without_date_every_x_weeks ?? null,
          is_one_shot: Boolean(surface.is_one_shot)
        };
      });

    return reply({
      ok: true,
      date: today,
      total: tasks.length,
      tasks
    });

  } catch (error) {
    console.error(
      "admin-hygiene-cleaning-tasks:",
      error?.message || error
    );

    return reply(
      { error: "Impossible de charger les tâches de nettoyage." },
      500
    );
  }
};
