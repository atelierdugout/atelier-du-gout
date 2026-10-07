import { neon } from '@neondatabase/serverless';

const sql=neon(process.env.DATABASE_URL);

await sql`
CREATE OR REPLACE FUNCTION issue_gift_card_for_purchase(
  p_purchase_id bigint,
  p_code_value text,
  p_code_hash text,
  p_code_last4 text
)
RETURNS TABLE(
  id bigint,
  code_value text,
  created boolean
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_purchase gift_purchases%ROWTYPE;
  v_card gift_cards%ROWTYPE;
BEGIN
  /*
   * Verrouille l'achat : deux webhooks/schedulers simultanés
   * ne peuvent pas émettre deux cartes.
   */
  SELECT *
  INTO v_purchase
  FROM gift_purchases
  WHERE gift_purchases.id = p_purchase_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'GIFT_PURCHASE_NOT_FOUND';
  END IF;

  /*
   * Interdiction absolue d'émettre avant paiement confirmé.
   */
  IF v_purchase.status <> 'paid' THEN
    RAISE EXCEPTION 'GIFT_PURCHASE_NOT_PAID';
  END IF;

  /*
   * Idempotence.
   */
  SELECT *
  INTO v_card
  FROM gift_cards
  WHERE purchase_id = p_purchase_id;

  IF FOUND THEN
    RETURN QUERY
    SELECT v_card.id, v_card.code_value, false;
    RETURN;
  END IF;

  INSERT INTO gift_cards(
    purchase_id,
    code_value,
    code_hash,
    code_last4,
    initial_cents,
    balance_cents
  )
  VALUES(
    p_purchase_id,
    p_code_value,
    p_code_hash,
    p_code_last4,
    v_purchase.value_cents,
    v_purchase.value_cents
  )
  RETURNING * INTO v_card;

  /*
   * Même transaction PostgreSQL que la création de la carte.
   */
  INSERT INTO gift_card_ledger(
    gift_card_id,
    event_type,
    amount_cents,
    note
  )
  VALUES(
    v_card.id,
    'issued',
    v_purchase.value_cents,
    'Émission carte cadeau'
  );

  RETURN QUERY
  SELECT v_card.id, v_card.code_value, true;
END;
$$;
`;

console.log('OK - émission carte cadeau atomique installée.');
console.log('OK - émission impossible avant paiement.');
console.log('OK - émission idempotente par purchase_id.');
