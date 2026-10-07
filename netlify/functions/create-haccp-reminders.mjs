import { createClient } from "@supabase/supabase-js";
import { db } from "./db.mjs";

const equipments = [
  {
    localId: 1,
    expertId: 145576,
    name: "Grand réfrigérateur"
  },
  {
    localId: 5,
    expertId: 145830,
    name: "Frigo / plan de travail réfrigéré 3 portes"
  },
  {
    localId: 6,
    expertId: 145831,
    name: "Grande vitrine réfrigérée comptoir"
  },
  {
    localId: 7,
    expertId: 145832,
    name: "Petite vitrine réfrigérée 98L"
  },
  {
    localId: 4,
    expertId: 145579,
    name: "Congélateur"
  }
];

const TEMPERATURE_SCHEDULE = {
  monday: [],
  tuesday: ["21:00"],
  wednesday: ["10:00", "21:00"],
  thursday: ["10:00", "21:00"],
  friday: ["10:00", "21:00"],
  saturday: ["21:00"],
  sunday: ["10:00"]
};

function parisWeekday(date) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Paris",
    weekday: "long"
  })
    .format(new Date(`${date}T12:00:00Z`))
    .toLowerCase();
}

function temperatureTimesFor(date) {
  return TEMPERATURE_SCHEDULE[parisWeekday(date)] || [];
}

function parisDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function parisOffsetFor(date, hour) {
  const approximate = new Date(
    `${date}T${String(hour).padStart(2, "0")}:00:00Z`
  );

  const part = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Paris",
    timeZoneName: "longOffset"
  })
    .formatToParts(approximate)
    .find(p => p.type === "timeZoneName")?.value;

  const match = part?.match(/GMT([+-]\d{2}):?(\d{2})?/);

  if (!match) {
    throw new Error(
      "Impossible de déterminer le fuseau Europe/Paris."
    );
  }

  return `${match[1]}:${match[2] || "00"}`;
}

function isoParis(date, hour) {
  return (
    `${date}T${String(hour).padStart(2, "0")}:00:00` +
    parisOffsetFor(date, hour)
  );
}

async function createTemperatureTasks(sql, date) {
  let created = 0;
  let existing = 0;

  const temperatureTimes = temperatureTimesFor(date);

  for (const equipment of equipments) {
    for (const time of temperatureTimes) {
      const inserted = await sql`
        INSERT INTO haccp_tasks (
          task_type,
          title,
          equipment_id,
          hygiene_expert_equipment_id,
          scheduled_date,
          scheduled_time,
          status
        )
        VALUES (
          'temperature',
          ${`Relevé température — ${equipment.name}`},
          ${equipment.localId},
          ${equipment.expertId},
          ${date}::date,
          ${time}::time,
          'pending'
        )
        ON CONFLICT (
          task_type,
          equipment_id,
          scheduled_date,
          scheduled_time
        )
        DO NOTHING
        RETURNING id
      `;

      if (inserted.length) {
        created++;
      } else {
        existing++;
      }
    }
  }

  return { created, existing };
}

export default async () => {
  const sql = db();

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const date = parisDate();

  const taskResult = await createTemperatureTasks(sql, date);

  const temperatureTimes = temperatureTimesFor(date);

  const reminders = temperatureTimes.map(time => {
    const hour = Number(time.slice(0, 2));
    const morning = time === "10:00";

    return {
      key: `haccp-temperature-${date}-${hour}`,
      title: morning
        ? "🌡️ HACCP — relevés de température du matin"
        : "🌡️ HACCP — relevés de température du soir",
      scheduled_for: isoParis(date, hour),
      period: morning ? "morning" : "evening"
    };
  });

  let created = 0;
  let existing = 0;
  let skippedPast = 0;

  for (const reminder of reminders) {
    const { data: found, error: findError } = await supabase
      .from("assistant_scheduled_actions")
      .select("id")
      .eq("action_type", "reminder")
      .contains("payload", {
        haccp_reminder_key: reminder.key
      })
      .limit(1);

    if (findError) throw findError;

    if (found?.length) {
      existing++;
      continue;
    }

    if (new Date(reminder.scheduled_for) <= new Date()) {
      skippedPast++;
      continue;
    }

    const { error } = await supabase
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
        scheduled_for: reminder.scheduled_for,
        status: "pending",
        requires_confirmation: false
      });

    if (error) throw error;
    created++;
  }

  console.log(
    `HACCP tâches : ${taskResult.created} créée(s), ` +
    `${taskResult.existing} déjà présente(s).`
  );

  console.log(
    `HACCP rappels : ${created} créé(s), ` +
    `${existing} déjà présent(s), ${skippedPast} passé(s).`
  );

  return Response.json({
    ok: true,
    date,
    tasks: taskResult,
    reminders: {
      created,
      existing,
      skippedPast
    }
  });
};

export const config = {
  schedule: "0 5 * * *"
};
