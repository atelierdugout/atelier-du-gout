import { neon } from '@neondatabase/serverless';
import crypto from 'node:crypto';

const sql=neon(process.env.DATABASE_URL);

const ref='TEST-GIFT-ATOMIC-1';
const email='test-gift-atomic@atelier.local';

async function cleanup(){
  const purchases=await sql`
    SELECT id
    FROM gift_purchases
    WHERE purchase_ref=${ref}
  `;

  for(const p of purchases){
    const cards=await sql`
      SELECT id
      FROM gift_cards
      WHERE purchase_id=${p.id}
    `;

    for(const card of cards){
      await sql`
        DELETE FROM gift_card_ledger
        WHERE gift_card_id=${card.id}
      `;
    }

    await sql`
      DELETE FROM gift_cards
      WHERE purchase_id=${p.id}
    `;
  }

  await sql`
    DELETE FROM gift_purchases
    WHERE purchase_ref=${ref}
  `;
}

function makeCode(){
  return 'TEST-'+crypto.randomBytes(12)
    .toString('hex')
    .toUpperCase();
}

function hash(value){
  return crypto
    .createHash('sha256')
    .update(value)
    .digest('hex');
}

try{
  await cleanup();

  const [purchase]=await sql`
    INSERT INTO gift_purchases(
      purchase_ref,
      status,
      value_cents,
      buyer_name,
      buyer_email,
      recipient_mode,
      recipient_name,
      recipient_email,
      send_mode
    )
    VALUES(
      ${ref},
      'pending_payment',
      5000,
      'Test acheteur',
      ${email},
      'other',
      'Test destinataire',
      ${email},
      'now'
    )
    RETURNING id
  `;

  const raw1=makeCode();

  let unpaidRefused=false;

  try{
    await sql`
      SELECT *
      FROM issue_gift_card_for_purchase(
        ${purchase.id},
        ${raw1},
        ${hash(raw1)},
        ${raw1.slice(-4)}
      )
    `;
  }catch(e){
    if(String(e.message).includes('GIFT_PURCHASE_NOT_PAID')){
      unpaidRefused=true;
    }else{
      throw e;
    }
  }

  if(!unpaidRefused){
    throw new Error(
      'Une carte a pu être émise avant confirmation du paiement.'
    );
  }

  console.log('OK - émission avant paiement refusée.');

  const before=await sql`
    SELECT COUNT(*)::int AS n
    FROM gift_cards
    WHERE purchase_id=${purchase.id}
  `;

  if(Number(before[0].n)!==0){
    throw new Error('Une carte existe après le refus.');
  }

  await sql`
    UPDATE gift_purchases
    SET
      status='paid',
      paid_at=NOW()
    WHERE id=${purchase.id}
  `;

  const raw2=makeCode();

  const first=await sql`
    SELECT *
    FROM issue_gift_card_for_purchase(
      ${purchase.id},
      ${raw2},
      ${hash(raw2)},
      ${raw2.slice(-4)}
    )
  `;

  if(!first[0]?.id || !first[0]?.code_value){
    throw new Error('Première émission sans carte.');
  }

  if(first[0].created !== true){
    throw new Error(
      `Première émission devrait avoir created=true, obtenu ${first[0].created}`
    );
  }

  console.log('OK - carte émise après paiement.');

  const raw3=makeCode();

  const second=await sql`
    SELECT *
    FROM issue_gift_card_for_purchase(
      ${purchase.id},
      ${raw3},
      ${hash(raw3)},
      ${raw3.slice(-4)}
    )
  `;

  if(String(second[0]?.id)!==String(first[0].id)){
    throw new Error('La seconde émission a créé une autre carte.');
  }

  if(second[0]?.code_value!==first[0].code_value){
    throw new Error('Le code cadeau a changé.');
  }

  if(second[0]?.created !== false){
    throw new Error(
      `Seconde émission devrait avoir created=false, obtenu ${second[0]?.created}`
    );
  }

  console.log('OK - seconde émission idempotente.');

  const cards=await sql`
    SELECT id,initial_cents,balance_cents,status
    FROM gift_cards
    WHERE purchase_id=${purchase.id}
  `;

  if(cards.length!==1){
    throw new Error(
      `Nombre de cartes attendu 1, obtenu ${cards.length}`
    );
  }

  if(
    Number(cards[0].initial_cents)!==5000 ||
    Number(cards[0].balance_cents)!==5000 ||
    cards[0].status!=='active'
  ){
    throw new Error('Montants ou statut de la carte incorrects.');
  }

  console.log('OK - montant et solde initial corrects : 50 €.');

  const ledger=await sql`
    SELECT event_type,amount_cents
    FROM gift_card_ledger
    WHERE gift_card_id=${cards[0].id}
      AND event_type='issued'
  `;

  if(ledger.length!==1){
    throw new Error(
      `Ledger issued attendu 1, obtenu ${ledger.length}`
    );
  }

  if(Number(ledger[0].amount_cents)!==5000){
    throw new Error(
      `Montant ledger incorrect : ${ledger[0].amount_cents}`
    );
  }

  console.log('OK - une seule écriture issued de 50 €.');

  await cleanup();

  console.log('OK - données de test nettoyées.');
  console.log('');
  console.log('TEST ÉMISSION CARTE CADEAU ATOMIQUE RÉUSSI.');

}catch(e){
  console.error('');
  console.error('TEST ÉCHOUÉ :',e.message);

  try{
    await cleanup();
    console.error('Nettoyage de sécurité effectué.');
  }catch(cleanupError){
    console.error(
      'ATTENTION - nettoyage incomplet :',
      cleanupError.message
    );
  }

  process.exit(1);
}
