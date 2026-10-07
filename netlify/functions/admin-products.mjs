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

    if (req.method !== "GET") {
        return reply({ error: "Méthode non autorisée" }, 405);
    }

    try {
        const { data, error } = await supabase
            .from("products")
            .select("*")
            .order("sort_order", { ascending: true })
            .order("created_at", { ascending: false });

        if (error) throw error;

        return reply(data || []);

    } catch (error) {
        console.error(error);

        return reply({
            error: error.message
        }, 500);
    }
};
