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

const clean = (value, max = 500) =>
  String(value ?? "").trim().slice(0, max);

export default async req => {
  if (!hasAdminAccess(req)) {
    return reply({
      error: "Accès administrateur refusé."
    }, 401);
  }

  if (req.method !== "POST") {
    return reply({
      error: "Méthode non autorisée."
    }, 405);
  }

  try {
    const body = await req.json();

    const equipmentName =
      clean(body.equipment_name, 150);

    const temperature =
      Number(body.temperature);

    const note =
      clean(body.note, 500) || null;

    const correctiveAction =
      clean(body.corrective_action, 500) || null;

    if (!equipmentName) {
      return reply({
        error: "Équipement obligatoire."
      }, 400);
    }

    if (!Number.isFinite(temperature)) {
      return reply({
        error: "Température invalide."
      }, 400);
    }

    if (temperature < -100 || temperature > 100) {
      return reply({
        error: "Température hors plage autorisée."
      }, 400);
    }

    const sql = db();

    const equipment = await sql`
      SELECT id, name, category
      FROM haccp_equipment
      WHERE name = ${equipmentName}
        AND active = true
      LIMIT 1
    `;

    if (!equipment.length) {
      return reply({
        error: "Équipement inconnu."
      }, 400);
    }

    const rows = await sql`
      INSERT INTO haccp_temperature_logs (
        equipment_name,
        temperature,
        note,
        corrective_action
      )
      VALUES (
        ${equipmentName},
        ${temperature},
        ${note},
        ${correctiveAction}
      )
      RETURNING
        id,
        equipment_name,
        temperature,
        measured_at,
        note,
        corrective_action
    `;

    return reply({
      ok: true,
      temperature: rows[0]
    });

  } catch (error) {
    console.error(
      "admin-hygiene-temperature:",
      error
    );

    return reply({
      error: "Impossible d'enregistrer le relevé."
    }, 500);
  }
};
