import { db } from "./db.mjs";

const reply = (data, status = 200) =>
  Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" }
  });

export default async (req) => {
  if (req.method !== "GET") {
    return reply({ error: "Méthode non autorisée." }, 405);
  }

  try {
    const sql = db();

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
  } catch (error) {
    console.error("site-settings:", error);
    return reply({ error: "Impossible de charger la configuration." }, 500);
  }
};
