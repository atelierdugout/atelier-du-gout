-- Réservation temporaire et atomique du stock pendant le paiement.
-- products.stock reste le stock physique.
-- Les réservations actives sont comptabilisées séparément.

CREATE TABLE IF NOT EXISTS public.stock_reservations (
    order_ref text NOT NULL,
    product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    quantity integer NOT NULL CHECK (quantity > 0),
    status text NOT NULL DEFAULT 'reserved'
        CHECK (status IN ('reserved', 'consumed', 'released')),
    expires_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (order_ref, product_id)
);

CREATE INDEX IF NOT EXISTS stock_reservations_active_product_idx
ON public.stock_reservations(product_id)
WHERE status = 'reserved';


CREATE OR REPLACE FUNCTION public.reserve_order_stock(
    p_order_ref text,
    p_items jsonb,
    p_expires_at timestamptz DEFAULT NULL
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
    v_reserved integer;
BEGIN
    IF p_order_ref IS NULL OR btrim(p_order_ref) = '' THEN
        RAISE EXCEPTION 'Référence commande invalide';
    END IF;

    IF p_items IS NULL
       OR jsonb_typeof(p_items) <> 'array'
       OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Panier invalide';
    END IF;

    -- Idempotence : une commande déjà réservée ne réserve pas deux fois.
    IF EXISTS (
        SELECT 1
        FROM public.stock_reservations
        WHERE order_ref = p_order_ref
          AND status = 'reserved'
    ) THEN
        RETURN jsonb_build_object(
            'reserved', false,
            'already_reserved', true
        );
    END IF;

    FOR item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_product_id := (item->>'product_id')::uuid;
        v_quantity := (item->>'quantity')::integer;

        IF v_quantity IS NULL OR v_quantity <= 0 THEN
            RAISE EXCEPTION
                'Quantité invalide pour le produit %',
                v_product_id;
        END IF;

        -- Verrouille le produit : deux checkouts concurrents sont sérialisés.
        SELECT stock
        INTO v_stock
        FROM public.products
        WHERE id = v_product_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Produit introuvable : %', v_product_id;
        END IF;

        -- NULL = stock non suivi.
        IF v_stock IS NOT NULL THEN
            SELECT COALESCE(SUM(quantity), 0)
            INTO v_reserved
            FROM public.stock_reservations
            WHERE product_id = v_product_id
              AND status = 'reserved'
              AND (expires_at IS NULL OR expires_at > now());

            IF (v_stock - v_reserved) < v_quantity THEN
                RAISE EXCEPTION
                    'STOCK_INSUFFICIENT:%:%:%',
                    v_product_id,
                    v_stock - v_reserved,
                    v_quantity;
            END IF;

            INSERT INTO public.stock_reservations(
                order_ref,
                product_id,
                quantity,
                status,
                expires_at
            )
            VALUES(
                p_order_ref,
                v_product_id,
                v_quantity,
                'reserved',
                p_expires_at
            );
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'reserved', true,
        'already_reserved', false
    );
END;
$$;


CREATE OR REPLACE FUNCTION public.release_order_stock(
    p_order_ref text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count integer;
BEGIN
    UPDATE public.stock_reservations
    SET status = 'released',
        updated_at = now()
    WHERE order_ref = p_order_ref
      AND status = 'reserved';

    GET DIAGNOSTICS v_count = ROW_COUNT;

    RETURN jsonb_build_object(
        'released', true,
        'count', v_count
    );
END;
$$;


CREATE OR REPLACE FUNCTION public.consume_order_stock(
    p_order_ref text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    r record;
    v_stock integer;
BEGIN
    -- Idempotence avec l'ancien mécanisme stock_events.
    IF EXISTS (
        SELECT 1
        FROM public.stock_events
        WHERE order_ref = p_order_ref
    ) THEN
        RETURN jsonb_build_object(
            'consumed', false,
            'already_consumed', true
        );
    END IF;

    FOR r IN
        SELECT product_id, quantity
        FROM public.stock_reservations
        WHERE order_ref = p_order_ref
          AND status = 'reserved'
        ORDER BY product_id
        FOR UPDATE
    LOOP
        SELECT stock
        INTO v_stock
        FROM public.products
        WHERE id = r.product_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Produit introuvable : %', r.product_id;
        END IF;

        IF v_stock IS NOT NULL THEN
            IF v_stock < r.quantity THEN
                RAISE EXCEPTION
                    'Stock incohérent pour le produit %',
                    r.product_id;
            END IF;

            UPDATE public.products
            SET stock = stock - r.quantity
            WHERE id = r.product_id;
        END IF;
    END LOOP;

    UPDATE public.stock_reservations
    SET status = 'consumed',
        updated_at = now()
    WHERE order_ref = p_order_ref
      AND status = 'reserved';

    INSERT INTO public.stock_events(order_ref)
    VALUES (p_order_ref);

    RETURN jsonb_build_object(
        'consumed', true,
        'already_consumed', false
    );
END;
$$;


REVOKE ALL ON FUNCTION public.reserve_order_stock(text, jsonb, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_order_stock(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.consume_order_stock(text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.reserve_order_stock(text, jsonb, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_order_stock(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.consume_order_stock(text) TO service_role;


CREATE OR REPLACE FUNCTION public.release_expired_stock_reservations()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count integer;
BEGIN
    UPDATE public.stock_reservations
    SET status = 'released',
        updated_at = now()
    WHERE status = 'reserved'
      AND expires_at IS NOT NULL
      AND expires_at <= now();

    GET DIAGNOSTICS v_count = ROW_COUNT;

    RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.release_expired_stock_reservations() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_expired_stock_reservations() TO service_role;
