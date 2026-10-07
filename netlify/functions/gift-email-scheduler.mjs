import { db } from './db.mjs';
import { createHash, randomBytes } from 'node:crypto';
import { sendBrevoEmail } from './email.mjs';

export const config={schedule:'@hourly'};
const euro=c=>`${(Number(c)/100).toFixed(2).replace('.',',')} €`;
const esc=(v='')=>String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const hash=s=>createHash('sha256').update(s).digest('hex');
const makeCode=()=>`ADG-${randomBytes(4).toString('hex').toUpperCase()}-${randomBytes(4).toString('hex').toUpperCase()}`;

async function ensureTables(sql){
  await sql`CREATE TABLE IF NOT EXISTS gift_purchases (
    id BIGSERIAL PRIMARY KEY,purchase_ref TEXT UNIQUE NOT NULL,status TEXT NOT NULL DEFAULT 'pending_payment',value_cents INTEGER NOT NULL,
    buyer_name TEXT NOT NULL,buyer_email TEXT NOT NULL,recipient_mode TEXT NOT NULL DEFAULT 'other',recipient_name TEXT,recipient_email TEXT,
    message TEXT,send_mode TEXT NOT NULL DEFAULT 'now',send_date DATE,mollie_payment_id TEXT UNIQUE,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    paid_at TIMESTAMPTZ,buyer_email_sent_at TIMESTAMPTZ,recipient_email_sent_at TIMESTAMPTZ,merchant_email_sent_at TIMESTAMPTZ
  )`;
  await sql`CREATE TABLE IF NOT EXISTS gift_cards (
    id BIGSERIAL PRIMARY KEY,purchase_id BIGINT UNIQUE NOT NULL REFERENCES gift_purchases(id) ON DELETE CASCADE,
    code_value TEXT UNIQUE NOT NULL,code_hash TEXT UNIQUE NOT NULL,code_last4 TEXT NOT NULL,initial_cents INTEGER NOT NULL,balance_cents INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),expires_at TIMESTAMPTZ,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS gift_card_ledger (
    id BIGSERIAL PRIMARY KEY,gift_card_id BIGINT NOT NULL REFERENCES gift_cards(id) ON DELETE CASCADE,event_type TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,order_ref TEXT,note TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
}
async function getOrIssue(sql,p){
  const raw=makeCode();
  const h=hash(raw);

  const rows=await sql`
    SELECT *
    FROM issue_gift_card_for_purchase(
      ${p.id},
      ${raw},
      ${h},
      ${raw.slice(-4)}
    )
  `;

  if(!rows[0]){
    throw new Error('Émission carte cadeau impossible.');
  }

  return {
    id:rows[0].id,
    code_value:rows[0].code_value
  };
}
async function sendRecipient(sql,p){
  if(p.recipient_email_sent_at) return;
  const card=await getOrIssue(sql,p);
  const msg=p.message?`<p style="font-size:16px;line-height:1.6"><strong>Message :</strong> ${esc(p.message)}</p>`:'';
  const html=`<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;color:#263326"><div style="background:#33402c;color:#fff;padding:22px 24px;font-family:Georgia,serif;font-size:24px">L’Atelier du Goût</div><div style="background:#fff;padding:26px 24px"><h1 style="font-family:Georgia,serif">Vous avez reçu une carte cadeau</h1><p>Bonjour ${esc(p.recipient_name||'')},</p><p>Une carte cadeau L’Atelier du Goût d’une valeur de <strong>${euro(p.value_cents)}</strong> vous a été offerte.</p>${msg}<div style="border:1px solid #d8c38a;padding:24px;border-radius:14px;background:#f7f4ec;margin:24px 0"><div style="font-size:13px">Votre code cadeau</div><div style="font-size:24px;font-weight:700;letter-spacing:1px;margin-top:8px">${esc(card.code_value)}</div><div style="margin-top:10px">Solde initial : <strong>${euro(p.value_cents)}</strong></div></div><p>Conservez ce code. Il peut être utilisé en plusieurs fois, sur la boutique en ligne ou directement en boutique.</p><p>L’Atelier du Goût<br>3 place Aristide Briand · 17470 Aulnay-de-Saintonge</p></div></div>`;
  await sendBrevoEmail({to:p.recipient_email,toName:p.recipient_name||'',subject:`Votre carte cadeau L’Atelier du Goût – ${euro(p.value_cents)}`,htmlContent:html,tag:'gift-card'});
  await sql`UPDATE gift_purchases SET recipient_email_sent_at=NOW() WHERE id=${p.id}`;
}

export async function processDueGiftEmails(sql){
  await ensureTables(sql);
  const rows=await sql`SELECT * FROM gift_purchases WHERE status='paid' AND recipient_email_sent_at IS NULL AND (send_mode='now' OR send_date<=CURRENT_DATE) ORDER BY id LIMIT 25`;
  for(const p of rows){ try{ await sendRecipient(sql,p); }catch(e){ console.error('Gift scheduler',p.purchase_ref,e); } }
  return rows.length;
}

export default async()=>{
  if(!process.env.BREVO_API_KEY) return new Response('BREVO_API_KEY absente',{status:500});
  const sql=db(); const processed=await processDueGiftEmails(sql);
  return Response.json({ok:true,processed});
};
