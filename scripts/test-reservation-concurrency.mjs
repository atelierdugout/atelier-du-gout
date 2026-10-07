import { neon } from '@neondatabase/serverless';

const sql=neon(process.env.DATABASE_URL);

const date='2099-12-31';
const prefix='TEST-CONC-RES-';

async function cleanup(){
  await sql`
    DELETE FROM reservations
    WHERE reservation_ref LIKE ${prefix+'%'}
  `;
}

async function reserve(ref,token,size){
  return sql`
    SELECT *
    FROM create_restaurant_reservation(
      ${ref},
      ${date}::date,
      '19:00'::time,
      ${size},
      'Test concurrence',
      'test-reservation@atelier.local',
      '0600000000',
      '',
      '',
      'dinner',
      10,
      ${token}
    )
  `;
}

try{
  await cleanup();

  console.log('===== TEST CONCURRENCE 6 + 6 POUR CAPACITÉ 10 =====');

  const results=await Promise.allSettled([
    reserve(prefix+'A','test-conc-token-a',6),
    reserve(prefix+'B','test-conc-token-b',6)
  ]);

  const ok=results.filter(r=>r.status==='fulfilled');
  const refused=results.filter(r=>r.status==='rejected');

  if(ok.length!==1 || refused.length!==1){
    throw new Error(
      `Attendu : 1 acceptée + 1 refusée. Obtenu : ${ok.length} acceptée(s), ${refused.length} refusée(s).`
    );
  }

  const refusal=String(refused[0].reason?.message || refused[0].reason);

  if(!refusal.includes('SERVICE_FULL')){
    throw new Error(
      `La seconde réservation a été refusée pour une raison inattendue : ${refusal}`
    );
  }

  console.log('OK - une seule réservation de 6 acceptée.');
  console.log('OK - la réservation concurrente est refusée SERVICE_FULL.');

  const [sum]=await sql`
    SELECT
      COUNT(*)::int AS reservations,
      COALESCE(SUM(party_size),0)::int AS guests
    FROM reservations
    WHERE reservation_ref LIKE ${prefix+'%'}
  `;

  if(Number(sum.reservations)!==1 || Number(sum.guests)!==6){
    throw new Error(
      `État DB incorrect : ${sum.reservations} réservation(s), ${sum.guests} couvert(s).`
    );
  }

  console.log('OK - base : 1 réservation / 6 couverts, jamais 12.');

  console.log('\n===== TEST IDEMPOTENCE REQUEST_TOKEN =====');

  const token='test-conc-token-idempotent';

  const first=await reserve(
    prefix+'IDEMPOTENT',
    token,
    4
  );

  const second=await reserve(
    prefix+'IDEMPOTENT-RETRY',
    token,
    4
  );

  const firstRow=first[0];
  const secondRow=second[0];

  const firstReservation=firstRow?.reservation;
  const secondReservation=secondRow?.reservation;

  if(
    !firstReservation?.id ||
    String(firstReservation.id)!==String(secondReservation?.id)
  ){
    throw new Error(
      'Le même request_token a créé deux réservations différentes.'
    );
  }

  if(firstRow.created !== true){
    throw new Error(
      `Premier appel : created attendu true, obtenu ${firstRow.created}`
    );
  }

  if(secondRow.created !== false){
    throw new Error(
      `Retry : created attendu false, obtenu ${secondRow.created}`
    );
  }

  console.log('OK - premier appel créé.');
  console.log('OK - retry retourne la même réservation sans doublon.');

  const [finalState]=await sql`
    SELECT
      COUNT(*)::int AS reservations,
      COALESCE(SUM(party_size),0)::int AS guests
    FROM reservations
    WHERE reservation_ref LIKE ${prefix+'%'}
  `;

  if(
    Number(finalState.reservations)!==2 ||
    Number(finalState.guests)!==10
  ){
    throw new Error(
      `État final attendu 2 réservations / 10 couverts ; obtenu ${finalState.reservations} / ${finalState.guests}.`
    );
  }

  console.log('OK - capacité finale exactement 10/10.');

  await cleanup();

  console.log('OK - données de test nettoyées.');
  console.log('');
  console.log('TEST RÉSERVATIONS ATOMIQUES RÉUSSI.');

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
