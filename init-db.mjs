
import { db } from "./db.mjs";
import { ensureLoyalty } from "./loyalty.mjs";
const reply=(x,s=200)=>Response.json(x,{status:s});
export default async(req)=>{
  if(req.method!=="POST") return reply({error:"Méthode non autorisée."},405);
  try{
    const sql=db();
    await ensureLoyalty(sql);
    await sql`CREATE TABLE IF NOT EXISTS orders (
      id BIGSERIAL PRIMARY KEY,
      order_ref TEXT UNIQUE NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending_payment',
      mode TEXT NOT NULL,
      zone TEXT,
      service_date TEXT,
      service_slot TEXT,
      customer_name TEXT,
      customer_phone TEXT,
      customer_email TEXT,
      customer_address TEXT,
      comments TEXT,
      allergies TEXT,
      subtotal_cents INTEGER NOT NULL,
      delivery_cents INTEGER NOT NULL DEFAULT 0,
      total_cents INTEGER NOT NULL,
      mollie_payment_id TEXT UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      paid_at TIMESTAMPTZ
    )`;
    await sql`CREATE TABLE IF NOT EXISTS order_items (
      id BIGSERIAL PRIMARY KEY,
      order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      product_key TEXT NOT NULL,
      product_name TEXT NOT NULL,
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      unit_price_cents INTEGER NOT NULL,
      line_total_cents INTEGER NOT NULL
    )`;
    await sql`CREATE TABLE IF NOT EXISTS payments (
      id BIGSERIAL PRIMARY KEY,
      order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      provider TEXT NOT NULL DEFAULT 'mollie',
      provider_payment_id TEXT UNIQUE NOT NULL,
      status TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
    await sql`CREATE TABLE IF NOT EXISTS email_events (
      id BIGSERIAL PRIMARY KEY,
      order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'sending',
      message_id TEXT,
      last_error TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(order_id, kind)
    )`;
    await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS gift_card_id BIGINT`;
    await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS gift_card_cents INTEGER NOT NULL DEFAULT 0`;
    await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS mollie_due_cents INTEGER NOT NULL DEFAULT 0`;
    await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS loyalty_account_id BIGINT`;
    await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS loyalty_points_used INTEGER NOT NULL DEFAULT 0`;
    await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS loyalty_discount_cents INTEGER NOT NULL DEFAULT 0`;
    await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS fulfillment_status TEXT NOT NULL DEFAULT 'new'`;
    await sql`UPDATE orders SET fulfillment_status='new' WHERE fulfillment_status IS NULL`;
    await sql`CREATE TABLE IF NOT EXISTS loyalty_redemptions (
      id BIGSERIAL PRIMARY KEY,
      order_id BIGINT UNIQUE NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      account_id BIGINT NOT NULL REFERENCES loyalty_accounts(id) ON DELETE CASCADE,
      points INTEGER NOT NULL CHECK(points>0),
      discount_cents INTEGER NOT NULL CHECK(discount_cents>0),
      status TEXT NOT NULL DEFAULT 'reserved',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
    await sql`CREATE TABLE IF NOT EXISTS gift_card_redemptions (
      id BIGSERIAL PRIMARY KEY, order_id BIGINT UNIQUE NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      gift_card_id BIGINT NOT NULL REFERENCES gift_cards(id), amount_cents INTEGER NOT NULL CHECK(amount_cents>0),
      status TEXT NOT NULL DEFAULT 'reserved', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
    return reply({ok:true,message:"Tables Neon prêtes."});
  }catch(e){
    console.error(e);
    return reply({error:"Initialisation Neon impossible.",detail:String(e.message||e)},500);
  }
};
