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

function parisParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);

  return Object.fromEntries(
    parts
      .filter(part => part.type !== "literal")
      .map(part => [part.type, part.value])
  );
}

export default async req => {
  if (!hasAdminAccess(req)) {
    return reply({ error: "Non autorisé." }, 401);
  }

  if (req.method !== "GET") {
    return reply({ error: "Méthode non autorisée." }, 405);
  }

  try {
    const sql = db();

    const now = parisParts();

    const today =
      `${now.year}-${now.month}-${now.day}`;

    const currentTime =
      `${now.hour}:${now.minute}:00`;

    const rows = await sql`
      SELECT
        id,
        task_type,
        title,
        equipment_id,
        hygiene_expert_equipment_id,
        scheduled_date::text AS scheduled_date,
        scheduled_time::text AS scheduled_time,
        status,
        completed_at,
        temperature,
        hygiene_expert_record_id,
        evidence_bucket,
        evidence_path,
        note
      FROM haccp_tasks
      WHERE scheduled_date = ${today}::date
      ORDER BY scheduled_time, equipment_id
    `;

    const tasks = rows.map(row => {
      let displayStatus = row.status;

      if (
        row.status === "pending" &&
        row.scheduled_time < currentTime
      ) {
        displayStatus = "late";
      }

      return {
        ...row,
        display_status: displayStatus
      };
    });

    return reply({
      ok: true,
      date: today,
      current_time: currentTime,
      tasks
    });

  } catch (error) {
    console.error(
      "admin-hygiene-tasks:",
      error?.message || error
    );

    return reply(
      { error: "Impossible de charger les tâches HACCP." },
      500
    );
  }
};
