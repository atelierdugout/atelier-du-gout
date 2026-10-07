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

const auth = (req) => hasAdminAccess(req);

export default async (req) => {

    if (!auth(req)) {
        return reply({
            error: "Authentification administrateur requise."
        }, 401);
    }

    if (req.method !== "POST") {
        return reply({ error: "Méthode non autorisée" }, 405);
    }

    try {
        const { id } = await req.json();

        if (!id) {
            return reply({
                error: "ID du produit manquant"
            }, 400);
        }

        const { error } = await supabase
            .from("products")
            .delete()
            .eq("id", id);

        if (error) throw error;

        return reply({ success: true });

    } catch (error) {
        console.error(error);

        return reply({
            error: error.message
        }, 500);
    }
};
