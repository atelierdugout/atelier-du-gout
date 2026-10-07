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

const allowedTypes = new Set([
    "image/jpeg",
    "image/png",
    "image/webp"
]);

const extensions = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp"
};

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
        const formData = await req.formData();
        const file = formData.get("image");

        if (!file || typeof file === "string") {
            return reply({ error: "Aucune image sélectionnée" }, 400);
        }

        if (!allowedTypes.has(file.type)) {
            return reply({
                error: "Format non autorisé. Utilisez JPG, PNG ou WebP."
            }, 400);
        }

        const maxSize = 5 * 1024 * 1024;

        if (file.size > maxSize) {
            return reply({
                error: "Image trop volumineuse. Maximum : 5 Mo."
            }, 400);
        }

        const extension = extensions[file.type];

        const filename =
            Date.now() +
            "-" +
            Math.random().toString(36).slice(2) +
            "." +
            extension;

        const buffer = await file.arrayBuffer();

        const { error } = await supabase.storage
            .from("product-images")
            .upload(filename, buffer, {
                contentType: file.type,
                upsert: false
            });

        if (error) throw error;

        const { data } = supabase.storage
            .from("product-images")
            .getPublicUrl(filename);

        return reply({
            success: true,
            url: data.publicUrl
        });

    } catch (error) {
        console.error(error);

        return reply({
            error: error.message
        }, 500);
    }
};
