import { hasAdminAccess } from "./admin-session.mjs";
import {
  ensureAssistantHistoryTables,
  getConversations,
  getConversation,
  getConversationMessages
} from "./assistant-history.mjs";

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
      error: "Accès administrateur requis."
    }, 401);
  }

  if (req.method !== "GET") {
    return reply({
      error: "Méthode non autorisée."
    }, 405);
  }

  try {
    await ensureAssistantHistoryTables();

    const url = new URL(req.url);
    const conversationId = url.searchParams.get("id");

    if (conversationId) {
      const conversation = await getConversation(conversationId);

      if (!conversation) {
        return reply({
          error: "Conversation introuvable."
        }, 404);
      }

      const messages =
        await getConversationMessages(conversationId);

      return reply({
        ok: true,
        conversation,
        messages
      });
    }

    const conversations = await getConversations();

    return reply({
      ok: true,
      conversations
    });

  } catch (error) {
    console.error(
      "admin-ai-conversations:",
      error?.message || error
    );

    return reply({
      error: "Impossible de charger les conversations."
    }, 500);
  }
};
