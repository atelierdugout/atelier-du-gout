import { createClient } from "@supabase/supabase-js";
import { sendAssistantReminderPush } from "./push-notification.mjs";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function reply(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    }
  });
}

export default async req => {
  try {
    const now = new Date().toISOString();

    const { data: actions, error } = await supabase
      .from("assistant_scheduled_actions")
      .select("*")
      .eq("status", "pending")
      .lte("scheduled_for", now)
      .order("scheduled_for", { ascending: true })
      .limit(20);

    if (error) throw error;

    const results = [];

    for (const action of actions || []) {
      const { data: claimed, error: claimError } = await supabase
        .from("assistant_scheduled_actions")
        .update({
          status: "processing",
          attempts: (action.attempts || 0) + 1,
          updated_at: new Date().toISOString()
        })
        .eq("id", action.id)
        .eq("status", "pending")
        .select()
        .maybeSingle();

      if (claimError) throw claimError;

      if (!claimed) {
        continue;
      }

      try {
        if (action.action_type !== "reminder") {
          throw new Error(
            `Type d'action non pris en charge par le worker: ${action.action_type}`
          );
        }

        const notification = await sendAssistantReminderPush({
          title: action.title
        });

        if (notification.sent === 0) {
          throw new Error(
            notification.subscriptions === 0
              ? "Aucun abonnement push disponible."
              : "La notification push n'a pas pu être envoyée."
          );
        }

        const { error: completeError } = await supabase
          .from("assistant_scheduled_actions")
          .update({
            status: "completed",
            executed_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq("id", action.id)
          .eq("status", "processing");

        if (completeError) throw completeError;

        results.push({
          id: action.id,
          status: "completed",
          action_type: action.action_type,
          title: action.title
        });
      } catch (error) {
        await supabase
          .from("assistant_scheduled_actions")
          .update({
            status: "failed",
            last_error: error?.message || String(error),
            updated_at: new Date().toISOString()
          })
          .eq("id", action.id)
          .eq("status", "processing");

        results.push({
          id: action.id,
          status: "failed",
          error: error?.message || String(error)
        });
      }
    }

    return reply({
      ok: true,
      processed: results.length,
      results,
      processed_at: now
    });
  } catch (error) {
    console.error("process-scheduled-actions:", error);

    return reply({
      error: "Impossible de traiter les actions programmées."
    }, 500);
  }
};

export const config = {
  schedule: "* * * * *"
};
