import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);

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

const dateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Paris",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

const today = dateFormatter.format(new Date());

const weekday = new Intl.DateTimeFormat("en-US", {
  timeZone: "Europe/Paris",
  weekday: "long"
})
  .format(new Date())
  .toLowerCase();

const times = TEMPERATURE_SCHEDULE[weekday] || [];

let created = 0;
let existing = 0;

for (const equipment of equipments) {
  for (const time of times) {

    const found = await sql`
      SELECT id
      FROM haccp_tasks
      WHERE task_type = 'temperature'
        AND equipment_id = ${equipment.localId}
        AND scheduled_date = ${today}::date
        AND scheduled_time = ${time}::time
      LIMIT 1
    `;

    if (found.length) {
      existing++;
      continue;
    }

    await sql`
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
        ${today}::date,
        ${time}::time,
        'pending'
      )
    `;

    created++;
  }
}

console.log(
  `OK : ${created} tâche(s) créée(s), ${existing} déjà présente(s) pour ${today}.`
);

const rows = await sql`
  SELECT
    id,
    title,
    scheduled_date,
    scheduled_time,
    status
  FROM haccp_tasks
  WHERE scheduled_date = ${today}::date
  ORDER BY scheduled_time, equipment_id
`;

console.table(rows);
