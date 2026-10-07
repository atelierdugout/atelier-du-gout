import { createClient } from "@supabase/supabase-js";
import { hasAdminAccess } from "./admin-session.mjs";
import { db } from "./db.mjs";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const BUCKET = "hygiene-evidence";

const allowedTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp"
]);

const extensions = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp"
};

const allowedEquipments = new Set([
  145576,
  145830,
  145831,
  145832,
  145579
]);

const reply = (data, status = 200) =>
  Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });

export default async req => {
  if (!hasAdminAccess(req)) {
    return reply({ error: "Non autorisé." }, 401);
  }

  if (req.method !== "POST") {
    return reply({ error: "Méthode non autorisée." }, 405);
  }

  try {
    const formData = await req.formData();

    const file = formData.get("image");
    const equipmentId = Number(formData.get("equipment_id"));
    const recordedAt = String(
      formData.get("recorded_at") || ""
    ).trim();

    const taskId = Number(formData.get("task_id"));

    if (!Number.isInteger(taskId) || taskId <= 0) {
      return reply({ error: "Tâche HACCP invalide." }, 400);
    }

    if (!allowedEquipments.has(equipmentId)) {
      return reply({ error: "Matériel non autorisé." }, 400);
    }

    if (!recordedAt) {
      return reply({ error: "Date du relevé obligatoire." }, 400);
    }

    const sql = db();

    const tasks = await sql`
      SELECT
        id,
        task_type,
        hygiene_expert_equipment_id,
        status,
        hygiene_expert_record_id
      FROM haccp_tasks
      WHERE id = ${taskId}
      LIMIT 1
    `;

    const task = tasks[0] || null;

    if (!task) {
      return reply({ error: "Tâche HACCP introuvable." }, 404);
    }

    if (
      task.task_type !== "temperature" ||
      Number(task.hygiene_expert_equipment_id) !== equipmentId
    ) {
      return reply(
        { error: "La tâche HACCP ne correspond pas au matériel." },
        409
      );
    }

    if (task.status !== "done") {
      return reply(
        {
          error:
            "Le relevé Hygiène Expert doit être enregistré avant la photo."
        },
        409
      );
    }

    if (!file || typeof file === "string") {
      return reply({ error: "Aucune photo sélectionnée." }, 400);
    }

    if (!allowedTypes.has(file.type)) {
      return reply({
        error: "Format non autorisé. Utilisez JPG, PNG ou WebP."
      }, 400);
    }

    const maxSize = 5 * 1024 * 1024;

    if (file.size > maxSize) {
      return reply({
        error: "Photo trop volumineuse. Maximum : 5 Mo."
      }, 400);
    }

    const extension = extensions[file.type];

    const safeDate = recordedAt
      .replace(/[^0-9]/g, "")
      .slice(0, 12);

    const filename =
      `${equipmentId}/${safeDate}-` +
      `${crypto.randomUUID()}.${extension}`;

    const buffer = await file.arrayBuffer();

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(filename, buffer, {
        contentType: file.type,
        upsert: false
      });

    if (error) {
      throw error;
    }

    const updated = await sql`
      UPDATE haccp_tasks
      SET
        evidence_bucket = ${BUCKET},
        evidence_path = ${filename}
      WHERE id = ${taskId}
        AND task_type = 'temperature'
        AND hygiene_expert_equipment_id = ${equipmentId}
        AND status = 'done'
      RETURNING id
    `;

    if (!updated.length) {
      await supabase.storage
        .from(BUCKET)
        .remove([filename]);

      return reply(
        {
          error:
            "La photo a été reçue mais n'a pas pu être rattachée à la tâche HACCP."
        },
        500
      );
    }

    return reply({
      ok: true,
      path: filename,
      bucket: BUCKET
    });
  } catch (error) {
    console.error(
      "admin-hygiene-photo:",
      error?.message || error
    );

    return reply(
      { error: "Impossible d'enregistrer la photo." },
      500
    );
  }
};
