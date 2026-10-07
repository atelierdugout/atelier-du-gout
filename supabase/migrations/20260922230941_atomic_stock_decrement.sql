CREATE TABLE IF NOT EXISTS public.stock_events (
    order_ref text PRIMARY KEY,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.apply_order_stock(
    p_order_ref text,
    p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    item jsonb;
    v_product_id uuid;
    v_quantity integer;
    v_stock integer;
BEGIN
    IF EXISTS (
        SELECT 1
        FROM public.stock_events
        WHERE order_ref = p_order_ref
    ) THEN
        RETURN jsonb_build_object(
            'applied', false,
            'already_applied', true
        );
    END IF;

    FOR item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_product_id := (item->>'product_id')::uuid;
        v_quantity := (item->>'quantity')::integer;

        IF v_quantity IS NULL OR v_quantity <= 0 THEN
            RAISE EXCEPTION 'Quantité invalide pour le produit %', v_product_id;
        END IF;

        SELECT stock
        INTO v_stock
        FROM public.products
        WHERE id = v_product_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Produit introuvable : %', v_product_id;
        END IF;

        -- NULL = stock non suivi
        IF v_stock IS NOT NULL THEN
            IF v_stock < v_quantity THEN
                RAISE EXCEPTION
                    'Stock insuffisant pour le produit % : disponible %, demandé %',
                    v_product_id,
                    v_stock,
                    v_quantity;
            END IF;

            UPDATE public.products
            SET stock = stock - v_quantity
            WHERE id = v_product_id;
        END IF;
    END LOOP;

    INSERT INTO public.stock_events(order_ref)
    VALUES (p_order_ref);

    RETURN jsonb_build_object(
        'applied', true,
        'already_applied', false
    );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_order_stock(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_order_stock(text, jsonb) TO service_role;
