import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

const email = 'test-loyalty-atomic@atelier.local';
const ref1 = 'TEST-LOYALTY-ATOMIC-1';
const ref2 = 'TEST-LOYALTY-ATOMIC-2';

async function cleanup() {
  const orders = await sql`
    SELECT id
    FROM orders
    WHERE order_ref IN (${ref1}, ${ref2})
  `;

  for (const order of orders) {
    await sql`DELETE FROM loyalty_ledger WHERE order_id=${order.id}`;
    await sql`DELETE FROM loyalty_redemptions WHERE order_id=${order.id}`;
    await sql`DELETE FROM order_items WHERE order_id=${order.id}`;
  }

  await sql`
    DELETE FROM orders
    WHERE order_ref IN (${ref1}, ${ref2})
  `;

  const accounts = await sql`
    SELECT id
    FROM loyalty_accounts
    WHERE email=${email}
  `;

  for (const account of accounts) {
    await sql`DELETE FROM loyalty_sessions WHERE account_id=${account.id}`;
    await sql`DELETE FROM loyalty_ledger WHERE account_id=${account.id}`;
    await sql`DELETE FROM loyalty_redemptions WHERE account_id=${account.id}`;
  }

  await sql`
    DELETE FROM loyalty_accounts
    WHERE email=${email}
  `;
}

try {
  await cleanup();

  const [account] = await sql`
    INSERT INTO loyalty_accounts(email, points)
    VALUES(${email}, 100)
    RETURNING id, points
  `;

  const createOrder = async ref => {
    const [order] = await sql`
      INSERT INTO orders(
        order_ref,
        status,
        mode,
        subtotal_cents,
        delivery_cents,
        total_cents,
        gift_card_cents,
        mollie_due_cents,
        loyalty_points_used,
        loyalty_discount_cents,
        fulfillment_status
      )
      VALUES(
        ${ref},
        'pending_payment',
        'pickup',
        1000,
        0,
        1000,
        0,
        1000,
        0,
        0,
        'new'
      )
      RETURNING id
    `;

    return order.id;
  };

  const order1 = await createOrder(ref1);
  const order2 = await createOrder(ref2);

  console.log('Compte test : 100 points');

  /* 1. Première réservation */
  await sql`
    SELECT *
    FROM reserve_loyalty_for_order(
      ${order1},
      ${account.id},
      75,
      500
    )
  `;

  let [balance] = await sql`
    SELECT points
    FROM loyalty_accounts
    WHERE id=${account.id}
  `;

  if (Number(balance.points) !== 25) {
    throw Error(`Solde attendu 25, obtenu ${balance.points}`);
  }

  console.log('OK - réservation : 100 → 25 points.');

  /* 2. Même réservation = idempotente */
  await sql`
    SELECT *
    FROM reserve_loyalty_for_order(
      ${order1},
      ${account.id},
      75,
      500
    )
  `;

  [balance] = await sql`
    SELECT points
    FROM loyalty_accounts
    WHERE id=${account.id}
  `;

  if (Number(balance.points) !== 25) {
    throw Error(`Réservation dupliquée : solde ${balance.points}`);
  }

  console.log('OK - seconde réservation même commande idempotente.');

  /* 3. Autre commande : impossible de redépenser 75 points */
  let refused = false;

  try {
    await sql`
      SELECT *
      FROM reserve_loyalty_for_order(
        ${order2},
        ${account.id},
        75,
        500
      )
    `;
  } catch (e) {
    if (String(e.message).includes('LOYALTY_INSUFFICIENT_POINTS')) {
      refused = true;
    } else {
      throw e;
    }
  }

  if (!refused) {
    throw Error('La double dépense aurait dû être refusée.');
  }

  console.log('OK - double dépense sur autre commande refusée.');

  /* 4. Annulation */
  await sql`
    SELECT release_loyalty_for_order(${order1})
  `;

  [balance] = await sql`
    SELECT points
    FROM loyalty_accounts
    WHERE id=${account.id}
  `;

  if (Number(balance.points) !== 100) {
    throw Error(`Solde attendu 100 après libération, obtenu ${balance.points}`);
  }

  console.log('OK - libération : 25 → 100 points.');

  /* Deuxième libération : ne doit pas recréditer */
  await sql`
    SELECT release_loyalty_for_order(${order1})
  `;

  [balance] = await sql`
    SELECT points
    FROM loyalty_accounts
    WHERE id=${account.id}
  `;

  if (Number(balance.points) !== 100) {
    throw Error(`Double remboursement détecté : ${balance.points}`);
  }

  console.log('OK - seconde libération idempotente.');

  /* 5. Nouvelle réservation */
  await sql`
    SELECT *
    FROM reserve_loyalty_for_order(
      ${order2},
      ${account.id},
      75,
      500
    )
  `;

  console.log('OK - nouvelle réservation créée.');

  /* 6. Paiement */
  await sql`
    SELECT apply_loyalty_for_order(
      ${order2},
      ${ref2}
    )
  `;

  const [redemption] = await sql`
    SELECT status
    FROM loyalty_redemptions
    WHERE order_id=${order2}
  `;

  if (redemption?.status !== 'applied') {
    throw Error(`Statut attendu applied, obtenu ${redemption?.status}`);
  }

  console.log('OK - récompense appliquée.');

  /* 7. Webhook Mollie répété : aucun double ledger */
  await sql`
    SELECT apply_loyalty_for_order(
      ${order2},
      ${ref2}
    )
  `;

  const [ledger] = await sql`
    SELECT COUNT(*)::int AS n
    FROM loyalty_ledger
    WHERE order_id=${order2}
      AND event_type='reward_redeemed'
  `;

  if (Number(ledger.n) !== 1) {
    throw Error(`Ledger fidélité dupliqué : ${ledger.n}`);
  }

  console.log('OK - seconde application idempotente.');

  [balance] = await sql`
    SELECT points
    FROM loyalty_accounts
    WHERE id=${account.id}
  `;

  if (Number(balance.points) !== 25) {
    throw Error(`Solde final attendu 25, obtenu ${balance.points}`);
  }

  console.log('OK - solde final correct : 25 points.');

  await cleanup();

  console.log('OK - données de test nettoyées.');
  console.log('');
  console.log('TEST FIDÉLITÉ ATOMIQUE RÉUSSI.');

} catch (e) {
  console.error('');
  console.error('TEST ÉCHOUÉ :', e.message);

  try {
    await cleanup();
    console.error('Nettoyage de sécurité effectué.');
  } catch (cleanupError) {
    console.error(
      'ATTENTION - nettoyage incomplet :',
      cleanupError.message
    );
  }

  process.exit(1);
}
