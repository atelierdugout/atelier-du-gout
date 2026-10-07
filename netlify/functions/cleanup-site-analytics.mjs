import { db } from "./db.mjs";

export const config = {
  schedule: "17 3 * * *"
};

export default async () => {
  try {
    const sql = db();

    const deleted = await sql`
      DELETE FROM site_analytics
      WHERE created_at < NOW() - INTERVAL '13 months'
      RETURNING id
    `;

    console.log(
      `[Analytics cleanup] ${deleted.length} ligne(s) supprimée(s).`
    );

    return Response.json({
      ok: true,
      deleted: deleted.length
    });
  } catch (error) {
    console.error("[Analytics cleanup]", error);

    return Response.json(
      { ok: false, error: "Nettoyage analytics impossible." },
      { status: 500 }
    );
  }
};
