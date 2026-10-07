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

function validateProduct(product) {
    const name = String(product.name ?? "").trim();

    if (!name) {
        return { error: "Nom du produit obligatoire." };
    }

    const price = Number(product.price);

    if (!Number.isFinite(price) || price < 0) {
        return { error: "Prix invalide." };
    }

    let stock = null;

    if (
        product.stock !== "" &&
        product.stock !== null &&
        product.stock !== undefined
    ) {
        stock = Number(product.stock);

        if (!Number.isInteger(stock) || stock < 0) {
            return { error: "Stock invalide : utilisez un nombre entier positif ou zéro." };
        }
    }

    let shelfLifeDays = null;

    if (
        product.shelf_life_days !== "" &&
        product.shelf_life_days !== null &&
        product.shelf_life_days !== undefined
    ) {
        shelfLifeDays = Number(product.shelf_life_days);

        if (
            !Number.isInteger(shelfLifeDays) ||
            shelfLifeDays < 1 ||
            shelfLifeDays > 365
        ) {
            return { error: "Durée de vie invalide : indiquez entre 1 et 365 jours." };
        }
    }

    return {
        value: {
            name,
            price,
            stock,
            shelfLifeDays
        }
    };
}

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
        const product = await req.json();

        const validation = validateProduct(product);

        if (validation.error) {
            return reply({ error: validation.error }, 400);
        }

        const {
            name,
            price,
            stock,
            shelfLifeDays
        } = validation.value;

        const { data, error } = await supabase
            .from("products")
            .insert({
                name,
                category: product.category || "",
                subcategory: product.subcategory || "",
                alcohol: product.alcohol === true,
                description: product.description || "",
                price,
                stock,
                image: product.image || "",
                active: product.active !== false,
                featured: product.featured === true,
                label_enabled: product.label_enabled === true,
                ingredients: product.ingredients || "",
                allergens: product.allergens || "",
                net_weight: product.net_weight || "",
                storage_instructions: product.storage_instructions || "À conserver entre 0 °C et +4 °C",
                shelf_life_days: shelfLifeDays
            })
            .select()
            .single();

        if (error) throw error;

        return reply(data);

    } catch (error) {
        console.error(error);

        return reply({
            error: error.message
        }, 500);
    }
};
