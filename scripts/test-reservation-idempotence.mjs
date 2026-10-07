import { neon } from '@neondatabase/serverless';

const sql=neon(process.env.DATABASE_URL);

const prefix='TEST-IDEMP-RES-';
const token='test-idempotence-reservation-token';
const date='2099-12-30';

async function cleanup(){
  await sql`
    DELETE FROM reservations
    WHERE reservation_ref LIKE ${prefix+'%'}
       OR request_token=${token}
  `;
}

try{
  await cleanup();

  const first=await sql`
    SELECT created
    FROM create_restaurant_reservation(
      ${prefix+'FIRST'},
      ${date}::date,
      '19:00'::time,
      4,
      'Test idempotence',
      'test-reservation@atelier.local',
      '0600000000',
      '',
      '',
      'dinner',
      10,
      ${token}
    )
  `;

  if(first[0]?.created !== true){
    throw new Error(
      `Premier appel : created attendu true, obtenu ${first[0]?.created}`
    );
  }

  console.log('OK - premier appel créé.');

  const second=await sql`
    SELECT created
    FROM create_restaurant_reservation(
      ${prefix+'SECOND'},
      ${date}::date,
      '19:00'::time,
      4,
      'Test idempotence',
      'test-reservation@atelier.local',
      '0600000000',
      '',
      '',
      'dinner',
      10,
      ${token}
    )
  `;

  if(second[0]?.created !== false){
    throw new Error(
      `Retry : created attendu false, obtenu ${second[0]?.created}`
    );
  }

  console.log('OK - retry reconnu comme déjà traité.');

  const rows=await sql`
    SELECT id,reservation_ref,party_size,request_token
    FROM reservations
    WHERE request_token=${token}
  `;

  if(rows.length!==1){
    throw new Error(
      `Attendu 1 réservation, obtenu ${rows.length}`
    );
  }

  if(rows[0].reservation_ref!==prefix+'FIRST'){
    throw new Error(
      `Le retry a remplacé la réservation initiale : ${rows[0].reservation_ref}`
    );
  }

  if(Number(rows[0].party_size)!==4){
    throw new Error(
      `Nombre de couverts incorrect : ${rows[0].party_size}`
    );
  }

  console.log('OK - une seule réservation existe en base.');
  console.log('OK - la réservation initiale est conservée.');

  await cleanup();

  console.log('OK - données de test nettoyées.');
  console.log('');
  console.log('TEST IDEMPOTENCE RÉSERVATION RÉUSSI.');

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
