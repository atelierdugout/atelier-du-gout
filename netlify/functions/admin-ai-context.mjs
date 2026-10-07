import { hasAdminAccess } from "./admin-session.mjs";
import { getBusinessContext } from "./business-context.mjs";

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
    return reply({
      error: "Authentification administrateur requise."
    }, 401);
  }

  if (req.method !== "GET") {
    return reply({
      error: "Méthode non autorisée."
    }, 405);
  }

  try {
    const context = await getBusinessContext();

    return reply({
      ok: true,
      ...context
    });
  } catch (error) {
    console.error("admin-ai-context:", error);

    return reply({
      error: "Impossible de charger le contexte entreprise."
    }, 500);
  }
};
