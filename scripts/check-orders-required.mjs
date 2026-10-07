import { neon } from '@neondatabase/serverless';

const sql=neon(process.env.DATABASE_URL);

const rows=await sql`
  SELECT
    column_name,
    data_type,
    is_nullable,
    column_default
  FROM information_schema.columns
  WHERE table_schema='public'
    AND table_name='orders'
  ORDER BY ordinal_position
`;

console.table(rows.filter(
  x =>
    x.is_nullable === 'NO' &&
    x.column_name !== 'id'
));

console.log('\n===== CONTRAINTES ORDERS =====');

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
    AND tc.table_name='orders'
  ORDER BY tc.constraint_name,kcu.ordinal_position
`;

console.table(constraints);
