import { db } from './db.mjs';

const reply=(x,s=200)=>Response.json(x,{status:s});
const allowed=new Set([30,50,60,80,100]);
const clean=s=>String(s||'').trim();
const emailOk=s=>/^\S+@\S+\.\S+$/.test(String(s||''));

async function ensureGiftTables(sql){
  await sql`CREATE TABLE IF NOT EXISTS gift_purchases (
    id BIGSERIAL PRIMARY KEY,
    purchase_ref TEXT UNIQUE NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending_payment',
    value_cents INTEGER NOT NULL,
    buyer_name TEXT NOT NULL,
    buyer_email TEXT NOT NULL,
    recipient_mode TEXT NOT NULL DEFAULT 'other',
    recipient_name TEXT,
    recipient_email TEXT,
    message TEXT,
    send_mode TEXT NOT NULL DEFAULT 'now',
    send_date DATE,
    mollie_payment_id TEXT UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    paid_at TIMESTAMPTZ,
    buyer_email_sent_at TIMESTAMPTZ,
    recipient_email_sent_at TIMESTAMPTZ,
    merchant_email_sent_at TIMESTAMPTZ
  )`;
  await sql`CREATE TABLE IF NOT EXISTS gift_cards (
    id BIGSERIAL PRIMARY KEY,
    purchase_id BIGINT UNIQUE NOT NULL REFERENCES gift_purchases(id) ON DELETE CASCADE,
    code_value TEXT UNIQUE NOT NULL,
    code_hash TEXT UNIQUE NOT NULL,
    code_last4 TEXT NOT NULL,
    initial_cents INTEGER NOT NULL,
    balance_cents INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS gift_card_ledger (
    id BIGSERIAL PRIMARY KEY,
    gift_card_id BIGINT NOT NULL REFERENCES gift_cards(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    order_ref TEXT,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
}

export default async(req)=>{
  if(req.method!=='POST') return reply({error:'Méthode non autorisée.'},405);
  if(!process.env.MOLLIE_API_KEY) return reply({error:'Clé Mollie absente.'},500);
  let b; try{ b=await req.json(); }catch{ return reply({error:'Requête invalide.'},400); }

  const value=Number(b.value);
  const buyerName=clean(b.buyerName);
  const buyerEmail=clean(b.buyerEmail).toLowerCase();
  const recipientMode=b.recipientMode==='me'?'me':'other';
  const recipientName=recipientMode==='me'?buyerName:clean(b.recipientName);
  const recipientEmail=recipientMode==='me'?buyerEmail:clean(b.recipientEmail).toLowerCase();
  const sendMode=b.sendMode==='later'?'later':'now';
  const sendDate=sendMode==='later'?clean(b.sendDate):null;
  const message=clean(b.message).slice(0,1500);

  if(!allowed.has(value)) return reply({error:'Montant de carte cadeau invalide.'},400);
  if(!buyerName || !emailOk(buyerEmail)) return reply({error:'Nom ou e-mail acheteur invalide.'},400);
  if(!recipientName || !emailOk(recipientEmail)) return reply({error:'Nom ou e-mail destinataire invalide.'},400);
  if(sendMode==='later' && !/^\d{4}-\d{2}-\d{2}$/.test(sendDate||'')) return reply({error:"Date d'envoi invalide."},400);

  const sql=db(); await ensureGiftTables(sql);
  const ref=`ADG-CAD-${Date.now()}`;
  const cents=value*100;
  let row;
  try{
    [row]=await sql`INSERT INTO gift_purchases
      (purchase_ref,status,value_cents,buyer_name,buyer_email,recipient_mode,recipient_name,recipient_email,message,send_mode,send_date)
      VALUES(${ref},'pending_payment',${cents},${buyerName},${buyerEmail},${recipientMode},${recipientName},${recipientEmail},${message||null},${sendMode},${sendDate||null})
      RETURNING id`;
  }catch(e){ console.error(e); return reply({error:'Impossible d’enregistrer la carte cadeau.'},500); }

  const site=process.env.URL || new URL(req.url).origin;
  const payload={
    amount:{currency:'EUR',value:value.toFixed(2)},
    description:`L'Atelier du Goût - Carte cadeau ${value} € - ${ref}`,
    redirectUrl:`${site}/cadeau-retour.html?ref=${encodeURIComponent(ref)}`,
    webhookUrl:`${site}/.netlify/functions/mollie-webhook`,
    locale:'fr_FR',
    metadata:{kind:'gift_card',purchaseRef:ref,purchaseId:String(row.id)}
  };
  const r=await fetch('https://api.mollie.com/v2/payments',{method:'POST',headers:{Authorization:`Bearer ${process.env.MOLLIE_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify(payload)});
  const p=await r.json();
  if(!r.ok){ await sql`UPDATE gift_purchases SET status='payment_creation_failed' WHERE id=${row.id}`; return reply({error:'Mollie a refusé la création du paiement.'},502); }
  await sql`UPDATE gift_purchases SET mollie_payment_id=${p.id} WHERE id=${row.id}`;
  return reply({checkoutUrl:p?._links?.checkout?.href,paymentId:p.id,purchaseRef:ref});
};
