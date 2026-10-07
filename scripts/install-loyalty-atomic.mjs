import { neon } from '@neondatabase/serverless';

const sql=neon(process.env.DATABASE_URL);

await sql`
CREATE OR REPLACE FUNCTION reserve_loyalty_for_order(
  p_order_id bigint,
  p_account_id bigint,
  p_points integer,
  p_discount_cents integer
)
RETURNS TABLE(
  account_id bigint,
  points integer,
  discount_cents integer,
  already_reserved boolean
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_existing loyalty_redemptions%ROWTYPE;
  v_points integer;
BEGIN
  IF p_points <= 0 OR p_discount_cents <= 0 THEN
    RAISE EXCEPTION 'LOYALTY_INVALID_AMOUNT';
  END IF;

  /*
   * Idempotence : si cette commande possède déjà
   * sa réservation, on ne débite jamais une seconde fois.
   */
  SELECT *
  INTO v_existing
  FROM loyalty_redemptions
  WHERE order_id = p_order_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.account_id <> p_account_id
       OR v_existing.points <> p_points
       OR v_existing.discount_cents <> p_discount_cents THEN
      RAISE EXCEPTION 'LOYALTY_RESERVATION_CONFLICT';
    END IF;

    RETURN QUERY
    SELECT
      v_existing.account_id,
      v_existing.points,
      v_existing.discount_cents,
      true;

    RETURN;
  END IF;

  /*
   * Verrou du compte : deux commandes simultanées
   * ne peuvent pas dépenser les mêmes points.
   */
  SELECT la.points
  INTO v_points
  FROM loyalty_accounts la
  WHERE la.id = p_account_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'LOYALTY_ACCOUNT_NOT_FOUND';
  END IF;

  IF v_points < p_points THEN
    RAISE EXCEPTION 'LOYALTY_INSUFFICIENT_POINTS';
  END IF;

  UPDATE loyalty_accounts
  SET
    points = loyalty_accounts.points - p_points,
    updated_at = NOW()
  WHERE id = p_account_id;

  INSERT INTO loyalty_redemptions(
    order_id,
    account_id,
    points,
    discount_cents,
    status
  )
  VALUES(
    p_order_id,
    p_account_id,
    p_points,
    p_discount_cents,
    'reserved'
  );

  UPDATE orders
  SET
    loyalty_account_id = p_account_id,
    loyalty_points_used = p_points,
    loyalty_discount_cents = p_discount_cents
  WHERE id = p_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'LOYALTY_ORDER_NOT_FOUND';
  END IF;

  RETURN QUERY
  SELECT
    p_account_id,
    p_points,
    p_discount_cents,
    false;
END;
$$;
`;

await sql`
CREATE OR REPLACE FUNCTION release_loyalty_for_order(
  p_order_id bigint
)
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  v_redemption loyalty_redemptions%ROWTYPE;
BEGIN
  SELECT *
  INTO v_redemption
  FROM loyalty_redemptions
  WHERE order_id = p_order_id
  FOR UPDATE;

  IF NOT FOUND OR v_redemption.status <> 'reserved' THEN
    RETURN false;
  END IF;

  UPDATE loyalty_accounts
  SET
    points = points + v_redemption.points,
    updated_at = NOW()
  WHERE id = v_redemption.account_id;

  UPDATE loyalty_redemptions
  SET
    status = 'released',
    updated_at = NOW()
  WHERE id = v_redemption.id;

  RETURN true;
END;
$$;
`;

await sql`
CREATE OR REPLACE FUNCTION apply_loyalty_for_order(
  p_order_id bigint,
  p_order_ref text
)
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  v_redemption loyalty_redemptions%ROWTYPE;
BEGIN
  SELECT *
  INTO v_redemption
  FROM loyalty_redemptions
  WHERE order_id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_redemption.status = 'applied' THEN
    RETURN false;
  END IF;

  IF v_redemption.status <> 'reserved' THEN
    RAISE EXCEPTION 'LOYALTY_NOT_RESERVED';
  END IF;

  UPDATE loyalty_redemptions
  SET
    status = 'applied',
    updated_at = NOW()
  WHERE id = v_redemption.id;

  INSERT INTO loyalty_ledger(
    account_id,
    event_type,
    points,
    order_id,
    order_ref,
    note
  )
  VALUES(
    v_redemption.account_id,
    'reward_redeemed',
    -v_redemption.points,
    p_order_id,
    p_order_ref,
    'Récompense fidélité ' ||
      ROUND(v_redemption.discount_cents / 100.0)::text ||
      '€'
  );

  RETURN true;
END;
$$;
`;

console.log('OK - réservation fidélité atomique installée.');
console.log('OK - libération fidélité atomique installée.');
console.log('OK - application fidélité atomique installée.');
