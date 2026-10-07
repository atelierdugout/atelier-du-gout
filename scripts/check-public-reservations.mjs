import { neon } from '@neondatabase/serverless';

const sql=neon(process.env.DATABASE_URL);

console.log('===== SCHÉMA SITE_SETTINGS =====');

const siteCols=await sql`
  SELECT
    column_name,
    data_type,
    is_nullable,
    column_default
  FROM information_schema.columns
  WHERE table_schema='public'
    AND table_name='site_settings'
  ORDER BY ordinal_position
`;

console.table(siteCols);

console.log('\n===== CONTENU SITE_SETTINGS =====');

const siteRows=await sql`
  SELECT *
  FROM site_settings
  LIMIT 20
`;

console.dir(siteRows,{depth:null});

console.log('\n===== FONCTION ATOMIQUE =====');

const fn=await sql`
  SELECT pg_get_functiondef(p.oid) AS definition
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public'
    AND p.proname='create_restaurant_reservation'
`;

console.log(fn[0]?.definition || 'FONCTION INTROUVABLE');

console.log('\n===== SCHÉMA RESERVATIONS =====');

const cols=await sql`
  SELECT
    column_name,
    data_type,
    is_nullable,
    column_default
  FROM information_schema.columns
  WHERE table_schema='public'
    AND table_name='reservations'
  ORDER BY ordinal_position
`;

console.table(cols);

console.log('\n===== INDEX RESERVATIONS =====');

const indexes=await sql`
  SELECT indexname,indexdef
  FROM pg_indexes
  WHERE schemaname='public'
    AND tablename='reservations'
  ORDER BY indexname
`;

console.table(indexes);
