import { createClient } from "@supabase/supabase-js";
import {
  getHygieneExpertMphSession,
  API_BASE
} from "./hygiene-expert-session.mjs";

function parisDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function parisOffsetFor(date, hour, minute = 0) {
  const approximate = new Date(
    `${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00Z`
  );

  const part = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Paris",
    timeZoneName: "longOffset"
  })
    .formatToParts(approximate)
    .find(p => p.type === "timeZoneName")?.value;

  const match = part?.match(/GMT([+-]\d{2}):?(\d{2})?/);

  if (!match) {
    throw new Error("Impossible de déterminer le fuseau Europe/Paris.");
  }

  return `${match[1]}:${match[2] || "00"}`;
}

function isoParis(date, hour, minute = 0) {
  return `${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00${parisOffsetFor(date, hour, minute)}`;
}

function weekdayName(date) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Paris",
    weekday: "long"
  }).format(new Date(`${date}T12:00:00+02:00`)).toLowerCase();
}

function scheduledToday(surface, weekday) {
  if (surface.weekly_without_date) return false;
  return surface[weekday] === true;
}

function getPeriods(surface) {
  const periods = [];

  if (surface.morning === true) periods.push("matin");
  if (surface.midday === true) periods.push("midi");
  if (surface.evening === true) periods.push("soir");

  return periods;
}

const OPEN_PERIODS = {
  monday: [],
  tuesday: ["evening"],
  wednesday: ["morning", "midday", "evening"],
  thursday: ["morning", "midday", "evening"],
  friday: ["morning", "midday", "evening"],
  saturday: ["evening"],
  sunday: ["morning", "midday"]
};

function isOpenPeriod(weekday, periodCode) {
  return (OPEN_PERIODS[weekday] || []).includes(periodCode);
}

const PERIODS = [
  {
    match: "matin",
    code: "morning",
    label: "Matin",
    hour: 9,
    minute: 30
  },
  {
    match: "midi",
    code: "midday",
    label: "Midi",
    hour: 14,
    minute: 0
  },
  {
    match: "soir",
    code: "evening",
    label: "Soir",
    hour: 21,
    minute: 0
  }
];

export default async () => {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const date = parisDate();
  const weekday = weekdayName(date);

  const token = await getHygieneExpertMphSession();

  const startDate = `${date} 00:00:00`;
  const endDate = `${date} 23:59:59`;

  const url =
    `${API_BASE}/mph/mph-planned-cleaning-surfaces` +
    `?startDate=${encodeURIComponent(startDate)}` +
    `&endDate=${encodeURIComponent(endDate)}`;

  const response = await fetch(url, {
    headers: {
      Authorization: token,
      Accept: "application/json"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(
      `Hygiène Expert planning nettoyage : HTTP ${response.status}`
    );
  }

  const data = await response.json();

  const surfaces = Array.isArray(data)
    ? data
    : Array.isArray(data.plannedSurfaces)
      ? data.plannedSurfaces
      : [];

  let created = 0;
  let existing = 0;
  let skippedPast = 0;

  for (const surface of surfaces) {
    if (!scheduledToday(surface, weekday)) continue;

    const surfaceId =
      surface.cleaning_surface_id ||
      surface.id_cleaning_surface ||
      surface.id;

    if (!surfaceId) continue;

    const name =
      surface.cleaning_surface_label ||
      surface.cleaning_surface_name ||
      surface.surface_name ||
      surface.name ||
      `Nettoyage ${surfaceId}`;

    const periods = getPeriods(surface);

    for (const period of PERIODS) {
      if (!periods.some(p => p.includes(period.match))) continue;

      /*
       * Le planning de nettoyage reste celui de Hygiène Expert,
       * mais aucun rappel n'est envoyé pendant une période fermée.
       */
      if (!isOpenPeriod(weekday, period.code)) continue;

      const scheduledFor = isoParis(
        date,
        period.hour,
        period.minute
      );

      if (new Date(scheduledFor) <= new Date()) {
        skippedPast++;
        continue;
      }

      const key =
        `haccp-cleaning-${date}-${surfaceId}-${period.code}`;

      const { data: found, error: findError } = await supabase
        .from("assistant_scheduled_actions")
        .select("id")
        .eq("action_type", "reminder")
        .contains("payload", {
          haccp_reminder_key: key
        })
        .limit(1);

      if (findError) throw findError;

      if (found?.length) {
        existing++;
        continue;
      }

      const { error } = await supabase
        .from("assistant_scheduled_actions")
        .insert({
          action_type: "reminder",
          title: `🧽 HACCP — ${name} — ${period.label}`,
          payload: {
            source: "haccp",
            type: "cleaning",
            date,
            period: period.code,
            cleaning_surface_id: surfaceId,
            haccp_reminder_key: key
          },
          scheduled_for: scheduledFor,
          status: "pending",
          requires_confirmation: false
        });

      if (error) throw error;

      created++;
    }
  }

  console.log(
    `Nettoyage HACCP : ${created} créé(s), ${existing} déjà présent(s), ${skippedPast} horaire(s) passé(s).`
  );

  return Response.json({
    ok: true,
    date,
    created,
    existing,
    skippedPast
  });
};

export const config = {
  schedule: "0 5 * * *"
};
