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
    const quantity = Number(body.quantity || 1);

    if (!body.product_name || !body.lot || !body.production_at) {
      return reply({
        error: "Données de traçabilité incomplètes"
      }, 400);
    }

    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
      return reply({ error: "Quantité invalide" }, 400);
    }

    const originalPrintId =
      body.original_print_id
        ? String(body.original_print_id).trim()
        : null;

    const reprintReason =
      body.reprint_reason
        ? String(body.reprint_reason).trim()
        : null;

    if (originalPrintId && !reprintReason) {
      return reply({
        error: "Le motif de réimpression est obligatoire."
      }, 400);
    }

    const requestedAt = new Date().toISOString();

    const { data, error } = await supabase
      .from("label_print_log")
      .insert({
        product_id: body.product_id || null,
        product_name: String(body.product_name).trim(),
        label_type:
          body.label_type === "sale" ? "sale" : "internal",
        lot: String(body.lot).trim(),
        production_at: body.production_at,
        expiry_date: body.expiry_date || null,
        quantity,
        net_weight: body.net_weight || null,
        storage_instructions:
          body.storage_instructions || null,
        ingredients: body.ingredients || null,
        allergens: body.allergens || null,

        status: "pending",
        requested_at: requestedAt,
        printed_at: null,
        failed_at: null,
        failure_reason: null,

        original_print_id: originalPrintId,
        reprint_reason: reprintReason,

        cancelled: false,
        cancelled_at: null,
        cancellation_reason: null
      })
      .select(`
        id,
        status,
        requested_at,
        printed_at,
        original_print_id,
        reprint_reason
      `)
      .single();

    if (error) throw error;

    return reply({
      ok: true,
      log: data
    });

  } catch (error) {
    console.error("admin-label-print-log:", error);

    return reply({
      error: error?.message || "Erreur serveur"
    }, 500);
  }
};
