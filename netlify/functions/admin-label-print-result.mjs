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
    const result = String(body.result || "").trim();
    const reason = String(body.reason || "").trim();

    if (!id) {
      return reply({ error: "Identifiant manquant" }, 400);
    }

    if (!["printed", "failed"].includes(result)) {
      return reply({ error: "Résultat d'impression invalide" }, 400);
    }

    const { data: existing, error: findError } = await supabase
      .from("label_print_log")
      .select("id,status,cancelled")
      .eq("id", id)
      .single();

    if (findError) throw findError;

    if (existing.cancelled || existing.status === "cancelled") {
      return reply({
        error: "Cette impression a été annulée"
      }, 409);
    }

    if (existing.status === "printed") {
      if (result === "printed") {
        return reply({
          ok: true,
          already_confirmed: true
        });
      }

      return reply({
        error: "Cette impression est déjà confirmée comme imprimée"
      }, 409);
    }

    const now = new Date().toISOString();

    const update =
      result === "printed"
        ? {
            status: "printed",
            printed_at: now,
            failed_at: null,
            failure_reason: null
          }
        : {
            status: "failed",
            printed_at: null,
            failed_at: now,
            failure_reason:
              reason || "Échec signalé par SII URL Print Agent"
          };

    const { data, error } = await supabase
      .from("label_print_log")
      .update(update)
      .eq("id", id)
      .select(`
        id,
        status,
        requested_at,
        printed_at,
        failed_at,
        failure_reason
      `)
      .single();

    if (error) throw error;

    return reply({
      ok: true,
      log: data
    });

  } catch (error) {
    console.error("admin-label-print-result:", error);

    return reply({
      error: error?.message || "Erreur serveur"
    }, 500);
  }
};
