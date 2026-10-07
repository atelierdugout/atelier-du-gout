import { db } from "../netlify/functions/db.mjs";

const sql = db();

await sql`
CREATE OR REPLACE FUNCTION reserve_order_slot(
  p_mode text,
  p_service_date text,
  p_service_slot text,
  p_max_orders integer,
  p_order_ref text,
  p_zone text,
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text,
  p_customer_address text,
  p_comments text,
  p_allergies text,
  p_subtotal_cents integer,
  p_delivery_cents integer,
  p_total_cents integer
)
RETURNS bigint
LANGUAGE plpgsql
AS $$
DECLARE
  v_count integer;
  v_order_id bigint;
BEGIN
  IF p_mode NOT IN ('pickup', 'delivery') THEN
    RAISE EXCEPTION 'invalid_order_mode';
  END IF;

  IF p_max_orders < 1 OR p_max_orders > 99 THEN
    RAISE EXCEPTION 'invalid_slot_capacity';
  END IF;

  /*
   * Un seul processus à la fois peut réserver exactement
   * le même mode/date/créneau.
   */
  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      p_mode || '|' || p_service_date || '|' || p_service_slot,
      0
    )
  );

  SELECT COUNT(*)::integer
  INTO v_count
  FROM orders
  WHERE mode = p_mode
    AND service_date = p_service_date
    AND service_slot = p_service_slot
    AND status IN (
      'pending_payment',
      'paid',
      'preparing',
      'ready',
      'completed'
    );

  IF v_count >= p_max_orders THEN
    RETURN NULL;
  END IF;

  INSERT INTO orders (
    order_ref,
    status,
    mode,
    zone,
    service_date,
    service_slot,
    customer_name,
    customer_phone,
    customer_email,
    customer_address,
    comments,
    allergies,
    subtotal_cents,
    delivery_cents,
    total_cents,
    mollie_due_cents
  )
  VALUES (
    p_order_ref,
    'pending_payment',
    p_mode,
    p_zone,
    p_service_date,
    p_service_slot,
    p_customer_name,
    p_customer_phone,
    p_customer_email,
    p_customer_address,
    p_comments,
    p_allergies,
    p_subtotal_cents,
    p_delivery_cents,
    p_total_cents,
    p_total_cents
  )
  RETURNING id INTO v_order_id;

  RETURN v_order_id;
END;
$$;
`;

console.log("OK - reserve_order_slot installée.");
