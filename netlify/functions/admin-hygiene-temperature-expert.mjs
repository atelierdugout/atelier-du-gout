import { hasAdminAccess } from "./admin-session.mjs";
import { db } from "./db.mjs";
import {
  getHygieneExpertMphSession,
  API_BASE
} from "./hygiene-expert-session.mjs";

const STAFF_MEMBER_ID = 53333;

const EQUIPMENTS = {
  145576: {
    label: "Grand réfrigérateur",
    typeId: 1,
    typeCode: "EQUIPFRIGO"
  },
  145830: {
    label: "Frigo / plan de travail réfrigéré 3 portes",
    typeId: 1,
    typeCode: "EQUIPFRIGO"
  },
  145831: {
    label: "Grande vitrine réfrigérée comptoir",
    typeId: 1,
    typeCode: "EQUIPFRIGO"
  },
  145832: {
    label: "Petite vitrine réfrigérée 98L",
    typeId: 1,
    typeCode: "EQUIPFRIGO"
  },
  145579: {
    label: "Congélateur",
    typeId: 3,
    typeCode: "EQUIPCONGEL"
  }
};

const reply = (data, status = 200) =>
  Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });

function parseRecordedAt(value) {
  const raw = String(value || "").trim();

  const match = raw.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/
  );

  if (!match) {
    throw new Error("Date du relevé invalide.");
  }

  const [, year, month, day, hour, minute] = match;

  // datetime-local représente ici une heure locale Europe/Paris.
  // On détermine d'abord l'offset applicable à cette date.
  const probe = new Date(
    `${year}-${month}-${day}T${hour}:${minute}:00Z`
  );

  const offset = getParisOffset(probe);

  const localDate =
    `${year}-${month}-${day}T${hour}:${minute}:00${offset}`;

  const instant = new Date(localDate);

  if (Number.isNaN(instant.getTime())) {
    throw new Error("Date du relevé invalide.");
  }

  if (instant.getTime() > Date.now() + 60_000) {
    throw new Error("La date du relevé ne peut pas être dans le futur.");
  }

  return {
    instant,
    localDate
  };
}

function getParisOffset(date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Paris",
    timeZoneName: "longOffset"
  }).formatToParts(date);

  const value =
    parts.find(p => p.type === "timeZoneName")?.value || "GMT+00:00";

  return value.replace("GMT", "");
}

export default async req => {
  if (!hasAdminAccess(req)) {
    return reply({ error: "Non autorisé." }, 401);
  }

  if (req.method !== "POST") {
    return reply({ error: "Méthode non autorisée." }, 405);
  }

  try {
    const body = await req.json();

    const equipmentId = Number(body.equipment_id);
    const temperature = Number(body.temperature);
    const recordedAt = String(body.recorded_at || "").trim();

    const rawTaskId = body.task_id;
    const taskId =
      rawTaskId === null ||
      rawTaskId === undefined ||
      rawTaskId === ""
        ? null
        : Number(rawTaskId);

    if (
      taskId !== null &&
      (!Number.isInteger(taskId) || taskId <= 0)
    ) {
      return reply({ error: "Tâche HACCP invalide." }, 400);
    }

    const equipment = EQUIPMENTS[equipmentId];

    if (!equipment) {
      return reply({ error: "Matériel non autorisé." }, 400);
    }

    let task = null;

    if (taskId !== null) {
      const sql = db();

      const rows = await sql`
        SELECT
          id,
          task_type,
          hygiene_expert_equipment_id,
          scheduled_date::text AS scheduled_date,
          scheduled_time,
          status
        FROM haccp_tasks
        WHERE id = ${taskId}
        LIMIT 1
      `;

      task = rows[0] || null;

      if (!task) {
        return reply({ error: "Tâche HACCP introuvable." }, 404);
      }

      if (task.task_type !== "temperature") {
        return reply(
          { error: "Cette tâche n'est pas un relevé de température." },
          400
        );
      }

      if (
        Number(task.hygiene_expert_equipment_id) !== equipmentId
      ) {
        return reply(
          { error: "La tâche HACCP ne correspond pas au matériel sélectionné." },
          409
        );
      }

      if (task.status === "done") {
        return reply(
          { error: "Cette tâche HACCP est déjà terminée." },
          409
        );
      }

      if (task.status === "skipped") {
        return reply(
          { error: "Cette tâche HACCP est marquée comme non effectuée." },
          409
        );
      }
    }

    if (!Number.isFinite(temperature)) {
      return reply({ error: "Température invalide." }, 400);
    }

    if (temperature < -50 || temperature > 50) {
      return reply({ error: "Température hors plage autorisée." }, 400);
    }

    if (!recordedAt) {
      return reply({ error: "Date du relevé obligatoire." }, 400);
    }

    const {
      instant: recordedInstant,
      localDate
    } = parseRecordedAt(recordedAt);

    if (
      task &&
      String(task.scheduled_date).slice(0, 10) !== localDate.slice(0, 10)
    ) {
      console.error("HACCP DATE MISMATCH", {
        taskId,
        scheduledDate: String(task.scheduled_date),
        recordedDate: localDate,
        recordedAt
      });
      return reply(
        {
          error:
            "La date du relevé ne correspond pas à la tâche HACCP sélectionnée."
        },
        409
      );
    }

    let periodId;

    if (task) {
      const scheduledTime =
        String(task.scheduled_time || "").slice(0, 5);

      if (scheduledTime === "10:00") {
        periodId = 1; // Matin
      } else if (scheduledTime === "21:00") {
        periodId = 3; // Soir
      } else {
        return reply(
          {
            error:
              "Période Hygiène Expert inconnue pour cette tâche HACCP."
          },
          409
        );
      }
    } else {
      /*
       * Saisie manuelle hors tâche :
       * Hygiène Expert définit 1=matin, 2=midi, 3=soir.
       * On déduit ici la période depuis l'heure réellement saisie.
       */
      const hour = Number(
        String(recordedAt).slice(11, 13)
      );

      if (hour < 12) {
        periodId = 1;
      } else if (hour < 18) {
        periodId = 2;
      } else {
        periodId = 3;
      }
    }

    const payload = {
      equipment_temperature_log: {
        date_form: recordedInstant.toISOString(),
        equipment_id: equipmentId,
        temperature_view: temperature,
        staff_member_id: STAFF_MEMBER_ID,
        date: localDate,
        temperature,
        period_id: periodId
      },
      equipment_type_id: equipment.typeId
    };

    const session = await getHygieneExpertMphSession();

    const response = await fetch(
      `${API_BASE}/MPH/equipments-temperatures-logs`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: session
        },
        body: JSON.stringify(payload)
      }
    );

    const text = await response.text();

    let data = null;

    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }

    if (!response.ok) {
      return reply(
        {
          error: "Hygiène Expert a refusé le relevé.",
          status: response.status
        },
        502
      );
    }

    const log =
      data?.equipment_temperature_log || data || {};

    const recordId =
      log?.id != null && Number.isFinite(Number(log.id))
        ? Number(log.id)
        : null;

    if (taskId !== null) {
      const sql = db();

      const updated = await sql`
        UPDATE haccp_tasks
        SET
          status = 'done',
          completed_at = now(),
          temperature = ${temperature},
          hygiene_expert_record_id = ${recordId}
        WHERE id = ${taskId}
          AND task_type = 'temperature'
          AND hygiene_expert_equipment_id = ${equipmentId}
          AND status = 'pending'
        RETURNING id
      `;

      if (!updated.length) {
        console.error(
          "Hygiène Expert enregistré mais tâche HACCP non mise à jour:",
          {
            taskId,
            equipmentId,
            recordId
          }
        );

        return reply(
          {
            error:
              "Le relevé a été enregistré dans Hygiène Expert, mais la tâche HACCP locale n'a pas pu être terminée.",
            hygiene_expert_saved: true,
            record_id: recordId
          },
          500
        );
      }
    }

    return reply({
      ok: true,
      equipment_id: equipmentId,
      equipment_label: equipment.label,
      temperature,
      record_id: recordId,
      conformity:
        typeof log?.conformity === "boolean"
          ? log.conformity
          : null,
      is_anomaly:
        typeof log?.is_anomaly === "boolean"
          ? log.is_anomaly
          : null,
      anomaly_id:
        log?.anomalie_id ??
        log?.anomaly?.id ??
        null
    });
  } catch (error) {
    console.error(
      "admin-hygiene-temperature-expert:",
      error?.message || error
    );

    return reply(
      { error: "Impossible d'enregistrer le relevé." },
      500
    );
  }
};
