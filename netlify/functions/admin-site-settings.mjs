import { db } from "./db.mjs";
import { hasAdminAccess } from "./admin-session.mjs";

const reply = (data, status = 200) =>
  Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" }
  });

const auth = (req) => hasAdminAccess(req);

export default async (req) => {
  if (!auth(req)) {
    return reply({
      error: "Authentification administrateur requise."
    }, 401);
  }

  try {
    const sql = db();

    if (req.method === "GET") {
      const rows = await sql`
        SELECT settings, updated_at
        FROM site_settings
        WHERE id = 'homepage'
        LIMIT 1
      `;

      return reply({
        settings: rows[0]?.settings || {},
        updated_at: rows[0]?.updated_at || null
      });
    }

    if (req.method === "POST") {
      const body = await req.json();
      const settings = body?.settings;

      if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
        return reply({ error: "Configuration invalide." }, 400);
      }

      const rows = await sql`
        INSERT INTO site_settings (id, settings, updated_at)
        VALUES ('homepage', ${JSON.stringify(settings)}::jsonb, NOW())
        ON CONFLICT (id)
        DO UPDATE SET
          settings = EXCLUDED.settings,
          updated_at = NOW()
        RETURNING settings, updated_at
      `;

      return reply({
        success: true,
        settings: rows[0].settings,
        updated_at: rows[0].updated_at
      });
    }

    return reply({ error: "Méthode non autorisée." }, 405);

  } catch (error) {
    console.error("admin-site-settings:", error);
    return reply({ error: "Impossible d'enregistrer la configuration." }, 500);
  }
};
