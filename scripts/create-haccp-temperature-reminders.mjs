import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function parisDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());

  const values = Object.fromEntries(
    parts
      .filter(p => p.type !== "literal")
      .map(p => [p.type, p.value])
  );

  return `${values.year}-${values.month}-${values.day}`;
}

function parisOffsetFor(date, hour) {
  // À 10h/21h, cette méthode évite les heures ambiguës
  // du changement d'heure autour de 02h/03h.
  const approximate = new Date(`${date}T${hour}:00:00Z`);

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Paris",
    timeZoneName: "longOffset"
  }).formatToParts(approximate);

  const zone = parts.find(
    p => p.type === "timeZoneName"
  )?.value || "GMT+01:00";

  return zone.replace("GMT", "");
}

function isoParis(date, hour) {
  const offset = parisOffsetFor(date, hour);
  return `${date}T${hour}:00:00${offset}`;
}

const TEMPERATURE_SCHEDULE = {
  monday: [],
  tuesday: ["21"],
  wednesday: ["10", "21"],
  thursday: ["10", "21"],
  friday: ["10", "21"],
  saturday: ["21"],
  sunday: ["10"]
};

function parisWeekday(date) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Paris",
    weekday: "long"
  })
    .format(new Date(`${date}T12:00:00Z`))
    .toLowerCase();
}

const date = parisDate();
const weekday = parisWeekday(date);
const temperatureTimes = TEMPERATURE_SCHEDULE[weekday] || [];

const reminders = temperatureTimes.map(hour => ({
  key: `haccp-temperature-${date}-${hour}`,
  title: hour === "10"
    ? "🌡️ HACCP — relevés de température du matin"
    : "🌡️ HACCP — relevés de température du soir",
  scheduled_for: isoParis(date, hour),
  period: hour === "10" ? "morning" : "evening"
}));

let created = 0;
let existing = 0;

for (const reminder of reminders) {
  const { data: rows, error: searchError } = await supabase
    .from("assistant_scheduled_actions")
    .select("id,payload,status")
    .eq("action_type", "reminder")
    .contains("payload", {
      haccp_reminder_key: reminder.key
    })
    .limit(1);

  if (searchError) throw searchError;

  if (rows?.length) {
    existing++;
    continue;
  }

  const scheduledFor = new Date(reminder.scheduled_for);

  // Ne crée jamais rétroactivement un rappel déjà passé.
  if (scheduledFor.getTime() <= Date.now()) {
    console.log(
      `IGNORÉ : ${reminder.title} — heure déjà passée`
    );
    continue;
  }

  const { error: insertError } = await supabase
    .from("assistant_scheduled_actions")
    .insert({
      action_type: "reminder",
      title: reminder.title,
      payload: {
        source: "haccp",
        type: "temperature",
        period: reminder.period,
        date,
        haccp_reminder_key: reminder.key
      },
      scheduled_for: scheduledFor.toISOString(),
      status: "pending",
      requires_confirmation: false
    });

  if (insertError) throw insertError;

  created++;
}

console.log(
  `OK : ${created} rappel(s) créé(s), ${existing} déjà présent(s).`
);
