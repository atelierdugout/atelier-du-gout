import { createClient } from "@supabase/supabase-js";
import { hasAdminAccess } from "./admin-session.mjs";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const reply = (data, status = 200) =>
  Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" }
  });

export default async (req) => {
  try {
    if (!(await hasAdminAccess(req))) {
      return reply({ error: "Non autorisé" }, 401);
    }

    if (req.method !== "POST") {
      return reply({ error: "Méthode non autorisée" }, 405);
    }

    const body = await req.json();
    const id = String(body.id || "").trim();
    const reason = String(body.reason || "").trim();

    if (!id) {
      return reply({ error: "Identifiant manquant" }, 400);
    }

    if (!reason) {
      return reply({
        error: "Indique la raison de l'annulation"
      }, 400);
    }

    const { data: existing, error: findError } = await supabase
      .from("label_print_log")
      .select("id,status,cancelled")
      .eq("id", id)
      .single();

    if (findError) throw findError;

    if (existing.cancelled || existing.status === "cancelled") {
      return reply({
        error: "Cette impression est déjà annulée"
      }, 409);
    }

    const cancelledAt = new Date().toISOString();

    const { data, error } = await supabase
      .from("label_print_log")
      .update({
        status: "cancelled",
        cancelled: true,
        cancelled_at: cancelledAt,
        cancellation_reason: reason
      })
      .eq("id", id)
      .select(`
        id,
        status,
        cancelled,
        cancelled_at,
        cancellation_reason
      `)
      .single();

    if (error) throw error;

    return reply({
      ok: true,
      log: data
    });

  } catch (error) {
    console.error("admin-label-print-cancel:", error);

    return reply({
      error: error?.message || "Erreur serveur"
    }, 500);
  }
};
