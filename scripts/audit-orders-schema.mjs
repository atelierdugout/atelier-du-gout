import { db } from "../netlify/functions/db.mjs";

const sql = db();

const columns = await sql`
  SELECT
    column_name,
    data_type,
    is_nullable,
    column_default
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'orders'
  ORDER BY ordinal_position
`;

console.log("\n===== COLONNES ORDERS =====");
console.table(columns);

const statuses = await sql`
  SELECT status, COUNT(*)::int AS count
  FROM orders
  GROUP BY status
  ORDER BY status
`;

console.log("\n===== STATUTS ACTUELS =====");
console.table(statuses);
