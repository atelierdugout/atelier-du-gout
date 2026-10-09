import { db } from "./db.mjs";
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


async function getExpertTemperatureLogs(today) {
  const [year, month, day] = today.split("-");
  const date = `${month}/${day}/${year}`;

  const params = new URLSearchParams({
    startdate: `${date} 00:00:00`,
    enddate: `${date} 23:59:59`,
    equipment_id: "null",
    signatory_id: "null",
    anomalies_designations_id: "null",
    fridges: "true",
    ovens: "true",
    freezers: "true",
    coolers: "true",
    hot_dist: "true",
    cold_dist: "true",
    page: "1",
    all_logs: "true",
    day: "false",
    week: "false",
    month: "false",
    deleted_materials: "true"
  });

  const session = await getHygieneExpertMphSession();

  const response = await fetch(
    `${API_BASE}/MPH/equipments-temperatures-logs?${params}`,
    {
      headers: {
        Accept: "application/json",
        Authorization: session
      }
    }
  );

  if (!response.ok) {
    throw new Error(`Lecture Hygiène Expert HTTP ${response.status}`);
  }

  const data = await response.json();

  if (!Array.isArray(data?.l_equipment_temp_logs)) {
    throw new Error("Format des relevés Hygiène Expert inattendu.");
  }

  return data.l_equipment_temp_logs.filter(
    log => !log.deleted &&
      String(log.recording_date || "").startsWith(today)
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

    // Synchroniser les relevés déjà enregistrés dans Hygiène Expert.
    // Une même combinaison équipement/période ne valide qu'une tâche.
    try {
      const expertLogs = await getExpertTemperatureLogs(today);
      const uniqueLogs = new Map();

      for (const log of expertLogs) {
        const equipmentId = Number(log.equipment_id);
        const periodId = Number(log.period_planning_info);

        if (!Number.isInteger(equipmentId)) continue;
        if (periodId !== 1 && periodId !== 3) continue;

        const scheduledTime = periodId === 1 ? "10:00" : "21:00";
        const key = `${equipmentId}:${scheduledTime}`;

        if (!uniqueLogs.has(key)) {
          uniqueLogs.set(key, log);
        }
      }

      for (const [key, log] of uniqueLogs) {
        const separator = key.indexOf(":");
        const equipmentId = key.slice(0, separator);
        const scheduledTime = key.slice(separator + 1);

        await sql`
          UPDATE haccp_tasks
          SET
            status = 'done',
            completed_at = COALESCE(
              ${log.validation_date || null}::timestamp,
              now()
            ),
            temperature = ${log.temperature ?? null}
          WHERE task_type = 'temperature'
            AND scheduled_date = ${today}::date
            AND scheduled_time = ${scheduledTime}::time
            AND hygiene_expert_equipment_id = ${Number(equipmentId)}
            AND status = 'pending'
        `;
      }
    } catch (syncError) {
      console.error(
        "Synchronisation Hygiène Expert :",
        syncError?.message || syncError
      );
    }

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

    const overdueRows = await sql`
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
      WHERE task_type = 'temperature'
        AND status = 'pending'
        AND scheduled_date < ${today}::date
        AND scheduled_date >= (${today}::date - INTERVAL '30 days')
      ORDER BY scheduled_date DESC, scheduled_time DESC, equipment_id
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
      tasks,
      overdue_tasks: overdueRows.map(row => ({
        ...row,
        display_status: "late"
      }))
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
