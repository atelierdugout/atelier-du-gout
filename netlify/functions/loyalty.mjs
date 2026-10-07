import { randomInt, createHash } from 'node:crypto';
import { sendBrevoEmail } from './email.mjs';
const norm=e=>String(e||'').trim().toLowerCase();
const hash=s=>createHash('sha256').update(String(s)).digest('hex');
export async function ensureLoyalty(sql){
 await sql`CREATE TABLE IF NOT EXISTS loyalty_accounts(id BIGSERIAL PRIMARY KEY,email TEXT UNIQUE NOT NULL,name TEXT,points INTEGER NOT NULL DEFAULT 50,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
 await sql`CREATE TABLE IF NOT EXISTS loyalty_ledger(id BIGSERIAL PRIMARY KEY,account_id BIGINT NOT NULL REFERENCES loyalty_accounts(id) ON DELETE CASCADE,event_type TEXT NOT NULL,points INTEGER NOT NULL,order_id BIGINT,order_ref TEXT,note TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
 await sql`CREATE UNIQUE INDEX IF NOT EXISTS loyalty_order_credit_unique ON loyalty_ledger(order_id) WHERE event_type='order_earned'`;
 await sql`CREATE TABLE IF NOT EXISTS loyalty_login_codes(id BIGSERIAL PRIMARY KEY,email TEXT NOT NULL,code_hash TEXT NOT NULL,expires_at TIMESTAMPTZ NOT NULL,used_at TIMESTAMPTZ,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
 await sql`CREATE TABLE IF NOT EXISTS loyalty_sessions(id BIGSERIAL PRIMARY KEY,account_id BIGINT NOT NULL REFERENCES loyalty_accounts(id) ON DELETE CASCADE,token_hash TEXT UNIQUE NOT NULL,expires_at TIMESTAMPTZ NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
}
export async function creditOrderPoints(sql,order){
 if(!order?.customer_email||order.status!=='paid') return;
 await ensureLoyalty(sql); const email=norm(order.customer_email);
 let a=(await sql`SELECT * FROM loyalty_accounts WHERE email=${email} LIMIT 1`)[0];
 if(!a) return; // points start once the customer has activated loyalty
 const paid=Math.max(0,Number(order.total_cents||0)-Number(order.loyalty_discount_cents||0)); const pts=Math.floor(paid/100); if(!pts)return;
 const ins=await sql`INSERT INTO loyalty_ledger(account_id,event_type,points,order_id,order_ref,note) VALUES(${a.id},'order_earned',${pts},${order.id},${order.order_ref},'Commande payée') ON CONFLICT DO NOTHING RETURNING id`;
 if(ins[0]) await sql`UPDATE loyalty_accounts SET points=points+${pts},updated_at=NOW() WHERE id=${a.id}`;
}
export async function sendLoginCode(sql,email){
 await ensureLoyalty(sql); email=norm(email); const code=String(randomInt(100000,1000000));
 await sql`INSERT INTO loyalty_login_codes(email,code_hash,expires_at) VALUES(${email},${hash(code)},NOW()+INTERVAL '10 minutes')`;
 if(!process.env.BREVO_API_KEY) throw Error('Service email non configuré.');
 await sendBrevoEmail({to:email,subject:'Votre code fidélité L’Atelier du Goût',htmlContent:`<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto"><h1 style="font-family:Georgia,serif;color:#33402c">L’Atelier du Goût</h1><p>Votre code de connexion est :</p><p style="font-size:30px;font-weight:700;letter-spacing:5px">${code}</p><p>Il est valable 10 minutes.</p></div>`,tag:'loyalty-login'});
}
export {norm,hash};
