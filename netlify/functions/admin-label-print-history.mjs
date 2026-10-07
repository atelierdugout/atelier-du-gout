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

    if (req.method !== "GET") {
      return reply({ error: "Méthode non autorisée" }, 405);
    }

    const { data, error } = await supabase
      .from("label_print_log")
      .select(`
        id,
        product_id,
        product_name,
        label_type,
        lot,
        production_at,
        expiry_date,
        quantity,
        net_weight,
        storage_instructions,
        ingredients,
        allergens,
        status,
        requested_at,
        printed_at,
        failed_at,
        failure_reason,
        cancelled,
        cancelled_at,
        cancellation_reason,
        original_print_id,
        reprint_reason
      `)
      .order("requested_at", { ascending: false })
      .limit(100);

    if (error) throw error;

    return reply({
      ok: true,
      history: data || []
    });

  } catch (error) {
    console.error("admin-label-print-history:", error);

    return reply({
      error: error?.message || "Erreur serveur"
    }, 500);
  }
};
