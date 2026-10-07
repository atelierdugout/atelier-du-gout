import { neon } from '@neondatabase/serverless';

const sql=neon(process.env.DATABASE_URL);

for(const table of [
  'gift_purchases',
  'gift_cards',
  'gift_card_ledger'
]){
  console.log('\n===== '+table+' =====');

  const cols=await sql`
    SELECT
      column_name,
      data_type,
      is_nullable,
      column_default
    FROM information_schema.columns
    WHERE table_schema='public'
      AND table_name=${table}
    ORDER BY ordinal_position
  `;

  console.table(cols);

  const constraints=await sql`
    SELECT
      tc.constraint_name,
      tc.constraint_type,
      kcu.column_name
    FROM information_schema.table_constraints tc
    LEFT JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name=kcu.constraint_name
     AND tc.table_schema=kcu.table_schema
    WHERE tc.table_schema='public'
      AND tc.table_name=${table}
    ORDER BY tc.constraint_name,kcu.ordinal_position
  `;

  console.table(constraints);
}
