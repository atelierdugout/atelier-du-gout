import { db } from "./db.mjs";

const reply = (data, status = 200) =>
  Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });

const clean = (value, max = 500) =>
  String(value || "").trim().slice(0, max);

export default async req => {
  if (req.method !== "POST") {
    return reply({ error: "Méthode non autorisée." }, 405);
  }

  try {
    const body = await req.json();

    const visitorId = clean(body.visitor_id, 100);
    const sessionId = clean(body.session_id, 100);
    const path = clean(body.path, 300);

    if (!visitorId || !sessionId || !path) {
      return reply({ error: "Données de visite incomplètes." }, 400);
    }

    const section =
      body.section === "boutique" ? "boutique" : "site";

    const allowedSources = new Set([
      "google",
      "instagram",
      "facebook",
      "direct",
      "other"
    ]);

    const requestedSource = clean(body.source, 50).toLowerCase();

    const source = allowedSources.has(requestedSource)
      ? requestedSource
      : "other";

    const sql = db();

    await sql`
      INSERT INTO site_analytics (
        visitor_id,
        session_id,
        path,
        section,
        source,
        referrer,
        utm_source,
        utm_medium,
        utm_campaign
      )
      VALUES (
        ${visitorId},
        ${sessionId},
        ${path},
        ${section},
        ${source},
        ${clean(body.referrer, 1000) || null},
        ${clean(body.utm_source, 100) || null},
        ${clean(body.utm_medium, 100) || null},
        ${clean(body.utm_campaign, 150) || null}
      )
    `;

    return reply({ ok: true });

  } catch (error) {
    console.error("track-visit:", error);
    return reply({ error: "Visite non enregistrée." }, 500);
  }
};
