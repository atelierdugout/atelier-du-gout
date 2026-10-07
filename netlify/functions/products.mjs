import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    }
  });

export default async () => {
  try {
    /*
     * Seulement les champs nécessaires à la boutique publique.
     * Les informations internes HACCP/étiquetage ne sortent plus.
     */
    const { data: products, error: productsError } = await supabase
      .from("products")
      .select(`
        id,
        slug,
        name,
        description,
        price,
        image,
        category,
        subcategory,
        alcohol,
        featured,
        sort_order,
        stock,
        active
      `)
      .eq("active", true)
      .order("sort_order");

    if (productsError) throw productsError;

    /*
     * Réservations encore actives.
     * Une réservation expirée ne doit plus réduire le stock disponible.
     */
    const { data: reservations, error: reservationsError } = await supabase
      .from("stock_reservations")
      .select("product_id,quantity")
      .eq("status", "reserved")
      .gt("expires_at", new Date().toISOString());

    if (reservationsError) throw reservationsError;

    const reservedByProduct = new Map();

    for (const reservation of reservations || []) {
      const id = String(reservation.product_id);

      reservedByProduct.set(
        id,
        (reservedByProduct.get(id) || 0) +
          Number(reservation.quantity || 0)
      );
    }

    const publicProducts = (products || []).map(product => {
      /*
       * NULL signifie toujours "stock non suivi".
       */
      if (product.stock === null || product.stock === undefined) {
        return {
          ...product,
          stock: null
        };
      }

      const physicalStock = Math.max(0, Number(product.stock) || 0);
      const reservedStock = reservedByProduct.get(String(product.id)) || 0;

      return {
        ...product,
        stock: Math.max(0, physicalStock - reservedStock)
      };
    });

    return json(publicProducts);

  } catch (err) {
    console.error("Catalogue public:", err);

    return json({
      error: "Impossible de charger le catalogue."
    }, 500);
  }
};
