import { db } from "./db.mjs";
import { createHash, randomBytes } from "node:crypto";
import { sendBrevoEmail } from "./email.mjs";
import { ensureEmailTable, sendOrderEmails } from "./order-emails.mjs";
import { creditOrderPoints } from './loyalty.mjs';

const esc=(v='')=>String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const euro=c=>`${(Number(c)/100).toFixed(2).replace('.',',')} €`;
const hash=s=>createHash('sha256').update(s).digest('hex');
const makeGiftCode=()=>`ADG-${randomBytes(4).toString('hex').toUpperCase()}-${randomBytes(4).toString('hex').toUpperCase()}`;

async function ensureGiftTables(sql){
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
async function getOrIssueGift(sql,p){
  let rows=await sql`SELECT id,code_value FROM gift_cards WHERE purchase_id=${p.id} LIMIT 1`;
  if(rows[0]) return rows[0];
  const raw=makeGiftCode(); const h=hash(raw);
  rows=await sql`INSERT INTO gift_cards(purchase_id,code_value,code_hash,code_last4,initial_cents,balance_cents)
    VALUES(${p.id},${raw},${h},${raw.slice(-4)},${p.value_cents},${p.value_cents}) RETURNING id,code_value`;
  await sql`INSERT INTO gift_card_ledger(gift_card_id,event_type,amount_cents,note) VALUES(${rows[0].id},'issued',${p.value_cents},'Émission carte cadeau')`;
  return rows[0];
}
async function sendGiftBuyer(sql,p){
  if(p.buyer_email_sent_at || !process.env.BREVO_API_KEY) return;
  const when=p.send_mode==='later'&&p.send_date?`Le cadeau sera envoyé le <strong>${esc(p.send_date)}</strong>.`:`Le cadeau est envoyé dès confirmation du paiement.`;
  const html=`<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;color:#263326"><div style="background:#33402c;color:#fff;padding:22px 24px;font-family:Georgia,serif;font-size:24px">L’Atelier du Goût</div><div style="background:#fff;padding:26px 24px"><h1 style="font-family:Georgia,serif">Achat de carte cadeau confirmé</h1><p>Bonjour ${esc(p.buyer_name)},</p><p>Votre paiement de <strong>${euro(p.value_cents)}</strong> pour la carte cadeau <strong>${esc(p.purchase_ref)}</strong> est confirmé.</p><p>Destinataire : <strong>${esc(p.recipient_name)}</strong> (${esc(p.recipient_email)})</p><p>${when}</p><p>Merci,<br>L’Atelier du Goût</p></div></div>`;
  await sendBrevoEmail({to:p.buyer_email,toName:p.buyer_name,subject:`Carte cadeau ${p.purchase_ref} confirmée`,htmlContent:html,tag:'gift-buyer'});
  await sql`UPDATE gift_purchases SET buyer_email_sent_at=NOW() WHERE id=${p.id}`;
}
async function sendGiftRecipient(sql,p){
  if(p.recipient_email_sent_at || !process.env.BREVO_API_KEY) return;
  const card=await getOrIssueGift(sql,p);
  const msg=p.message?`<p><strong>Message :</strong> ${esc(p.message)}</p>`:'';
  const html=`<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;color:#263326"><div style="background:#33402c;color:#fff;padding:22px 24px;font-family:Georgia,serif;font-size:24px">L’Atelier du Goût</div><div style="background:#fff;padding:26px 24px"><h1 style="font-family:Georgia,serif">Vous avez reçu une carte cadeau</h1><p>Bonjour ${esc(p.recipient_name||'')},</p><p>Une carte cadeau L’Atelier du Goût d’une valeur de <strong>${euro(p.value_cents)}</strong> vous a été offerte.</p>${msg}<div style="border:1px solid #d8c38a;padding:24px;border-radius:14px;background:#f7f4ec;margin:24px 0"><div style="font-size:13px">Votre code cadeau</div><div style="font-size:24px;font-weight:700;letter-spacing:1px;margin-top:8px">${esc(card.code_value)}</div><div style="margin-top:10px">Solde initial : <strong>${euro(p.value_cents)}</strong></div></div><p>Conservez ce code. Il pourra être utilisé en plusieurs fois. L’utilisation en ligne et le débit en boutique seront activés dans l’étape suivante.</p><p>L’Atelier du Goût<br>3 place Aristide Briand · 17470 Aulnay-de-Saintonge</p></div></div>`;
  await sendBrevoEmail({to:p.recipient_email,toName:p.recipient_name||'',subject:`Votre carte cadeau L’Atelier du Goût – ${euro(p.value_cents)}`,htmlContent:html,tag:'gift-card'});
  await sql`UPDATE gift_purchases SET recipient_email_sent_at=NOW() WHERE id=${p.id}`;
}
async function sendGiftMerchant(sql,p){
  if(p.merchant_email_sent_at || !process.env.BREVO_API_KEY) return;
  const to=process.env.ORDER_NOTIFICATION_EMAIL||'nicolas@atelierdugoutaulnay.com';
  const html=`<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;color:#263326"><h1>Nouvelle carte cadeau payée</h1><p><strong>${esc(p.purchase_ref)}</strong> · ${euro(p.value_cents)}</p><p>Acheteur : ${esc(p.buyer_name)} · ${esc(p.buyer_email)}</p><p>Destinataire : ${esc(p.recipient_name)} · ${esc(p.recipient_email)}</p><p>Envoi : ${p.send_mode==='later'?`programmé au ${esc(p.send_date||'')}`:'immédiat'}</p></div>`;
  await sendBrevoEmail({to,toName:'Nicolas',subject:`Carte cadeau payée ${p.purchase_ref} — ${euro(p.value_cents)}`,htmlContent:html,tag:'gift-merchant'});
  await sql`UPDATE gift_purchases SET merchant_email_sent_at=NOW() WHERE id=${p.id}`;
}
async function handleGiftPayment(sql,payment,status){
  await ensureGiftTables(sql);
  const id=payment.id;
  if(status==='paid'){
    const rows=await sql`UPDATE gift_purchases SET status='paid',paid_at=COALESCE(paid_at,NOW()) WHERE mollie_payment_id=${id} RETURNING *`;
    const g=rows[0]; if(!g) return;
    try{ await sendGiftBuyer(sql,g); }catch(e){ console.error('Email acheteur cadeau:',e); }
    try{ await sendGiftMerchant(sql,g); }catch(e){ console.error('Email boutique cadeau:',e); }
    const due=g.send_mode==='now' || (g.send_date && new Date(String(g.send_date))<=new Date());
    if(due){ try{ await sendGiftRecipient(sql,g); }catch(e){ console.error('Email destinataire cadeau:',e); } }
  }else if(['failed','canceled','expired'].includes(status)){
    await sql`UPDATE gift_purchases SET status=${status} WHERE mollie_payment_id=${id} AND status<>'paid'`;
  }
}

export default async(req)=>{
  if(req.method!=="POST") return new Response("Method not allowed",{status:405});
  if(!process.env.MOLLIE_API_KEY) return new Response("Missing key",{status:500});
  const form=await req.formData(), id=form.get("id");
  if(!id) return new Response("Missing id",{status:400});
  const r=await fetch(`https://api.mollie.com/v2/payments/${encodeURIComponent(id)}`,{headers:{"Authorization":`Bearer ${process.env.MOLLIE_API_KEY}`}});
  if(!r.ok) return new Response("Verification failed",{status:502});
  const p=await r.json(), sql=db();
  const status=String(p.status||"unknown");

  if(p?.metadata?.kind==='gift_card'){
    await handleGiftPayment(sql,p,status);
    return new Response('OK',{status:200});
  }

  await sql`UPDATE payments SET status=${status},updated_at=NOW() WHERE provider_payment_id=${id}`;
  if(status==="paid"){
    const rows=await sql`UPDATE orders SET status='paid',paid_at=COALESCE(paid_at,NOW()) WHERE mollie_payment_id=${id} RETURNING *`;
    if(rows[0]){
      const loy=await sql`UPDATE loyalty_redemptions SET status='applied',updated_at=NOW() WHERE order_id=${rows[0].id} AND status='reserved' RETURNING *`;
      if(loy[0]) await sql`INSERT INTO loyalty_ledger(account_id,event_type,points,order_id,order_ref,note) VALUES(${loy[0].account_id},'reward_redeemed',${-loy[0].points},${rows[0].id},${rows[0].order_ref},${`Récompense fidélité ${(loy[0].discount_cents/100).toFixed(0)} €`})`;
      const red=await sql`UPDATE gift_card_redemptions SET status='applied',updated_at=NOW() WHERE order_id=${rows[0].id} AND status='reserved' RETURNING *`;
      if(red[0]) await sql`INSERT INTO gift_card_ledger(gift_card_id,event_type,amount_cents,order_ref,note) VALUES(${red[0].gift_card_id},'redeemed',${-red[0].amount_cents},${rows[0].order_ref},'Utilisation commande en ligne')`;
      try{ await ensureEmailTable(sql); await sendOrderEmails(sql,rows[0]); } catch(e){ console.error("Traitement emails:",e); }
      try{ await creditOrderPoints(sql,rows[0]); } catch(e){ console.error("Fidélité:",e); }
    }
  } else if(["failed","canceled","expired"].includes(status)){
    const orders=await sql`UPDATE orders SET status=${status} WHERE mollie_payment_id=${id} AND status<>'paid' RETURNING id`;
    if(orders[0]){
      const red=await sql`UPDATE gift_card_redemptions SET status='released',updated_at=NOW() WHERE order_id=${orders[0].id} AND status='reserved' RETURNING *`;
      if(red[0]) await sql`UPDATE gift_cards SET balance_cents=balance_cents+${red[0].amount_cents},status='active',updated_at=NOW() WHERE id=${red[0].gift_card_id}`;
      const loy=await sql`UPDATE loyalty_redemptions SET status='released',updated_at=NOW() WHERE order_id=${orders[0].id} AND status='reserved' RETURNING *`;
      if(loy[0]) await sql`UPDATE loyalty_accounts SET points=points+${loy[0].points},updated_at=NOW() WHERE id=${loy[0].account_id}`;
    }
  }
  return new Response("OK",{status:200});
};
