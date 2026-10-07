import { hasAdminAccess } from "./admin-session.mjs";
import { sendAssistantReminderPush } from "./push-notification.mjs";

const reply = (data, status = 200) =>
  Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" }
  });

export default async (req) => {
  if (req.method !== "POST") {
    return reply({ error: "Method not allowed" }, 405);
  }

  if (!hasAdminAccess(req)) {
    return reply({ error: "Authentification administrateur requise." }, 401);
  }

  try {
    const result = await sendAssistantReminderPush({
      title: "🌡️ Test HACCP — push production"
    });

    return reply({
      ok: result.sent > 0,
      ...result
    });
  } catch (error) {
    console.error("Test push production:", error);
    return reply({
      ok: false,
      error: error.message || String(error)
    }, 500);
  }
};
