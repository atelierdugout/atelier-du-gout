import { db } from "../netlify/functions/db.mjs";

const sql = db();

const rows = await sql`
  SELECT
    p.proname AS function_name,
    pg_get_function_arguments(p.oid) AS arguments,
    pg_get_function_result(p.oid) AS result
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'reserve_order_slot'
`;

console.table(rows);

if (rows.length !== 1) {
  throw new Error("reserve_order_slot introuvable ou dupliquée.");
}

console.log("OK - fonction atomique présente.");
