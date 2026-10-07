import { db } from "./db.mjs";
import { createClient } from "@supabase/supabase-js";
import { createHash, randomBytes } from "node:crypto";
import { sendBrevoEmail } from "./email.mjs";
import { ensureEmailTable, sendOrderEmails } from "./order-emails.mjs";
import { creditOrderPoints } from './loyalty.mjs';

import { sendNewOrderPush } from "./push-notification.mjs";
const esc=(v='')=>String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const euro=c=>`${(Number(c)/100).toFixed(2).replace('.',',')} €`;
const hash=s=>createHash('sha256').update(s).digest('hex');
const makeGiftCode=()=>`ADG-${randomBytes(4).toString('hex').toUpperCase()}-${randomBytes(4).toString('hex').toUpperCase()}`;

function stockClient(){
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

async function releaseStock(orderRef){
  const {error}=await stockClient().rpc('release_order_stock',{
    p_order_ref:orderRef
  });

  if(error)throw error;
}

async function applyStock(sql,order){
  if(order.stock_applied_at)return;

  const supabase=stockClient();

  /*
   * Nouvelle commande :
   * consommation de la réservation.
   *
   * Ancienne commande sans réservation :
   * fallback vers apply_order_stock.
   */
  const {data:reservations,error:reservationError}=await supabase
    .from('stock_reservations')
    .select('product_id')
    .eq('order_ref',order.order_ref)
    .limit(1);

  if(reservationError)throw reservationError;

  let data;

  if(Array.isArray(reservations) && reservations.length){
    const result=await supabase.rpc('consume_order_stock',{
      p_order_ref:order.order_ref
    });

    if(result.error)throw result.error;
    data=result.data;
  }else{
    const items=await sql`
      SELECT product_key,quantity
      FROM order_items
      WHERE order_id=${order.id}
    `;

    const result=await supabase.rpc('apply_order_stock',{
      p_order_ref:order.order_ref,
      p_items:items.map(x=>({
        product_id:x.product_key,
        quantity:x.quantity
      }))
    });

    if(result.error)throw result.error;
    data=result.data;
  }

  await sql`
    UPDATE orders
    SET stock_applied_at=COALESCE(stock_applied_at,NOW())
    WHERE id=${order.id}
  `;

  return data;
}

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
  /*
   * Le code est généré ici, mais PostgreSQL décide
   * atomiquement s'il faut réellement créer la carte.
   */
  const raw=makeGiftCode();
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
  const html=`<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;color:#263326"><div style="background:#33402c;color:#fff;padding:22px 24px;font-family:Georgia,serif;font-size:24px">L’Atelier du Goût</div><div style="background:#fff;padding:26px 24px"><h1 style="font-family:Georgia,serif">Vous avez reçu une carte cadeau</h1><p>Bonjour ${esc(p.recipient_name||'')},</p><p>Une carte cadeau L’Atelier du Goût d’une valeur de <strong>${euro(p.value_cents)}</strong> vous a été offerte.</p>${msg}<div style="border:1px solid #d8c38a;padding:24px;border-radius:14px;background:#f7f4ec;margin:24px 0"><div style="font-size:13px">Votre code cadeau</div><div style="font-size:24px;font-weight:700;letter-spacing:1px;margin-top:8px">${esc(card.code_value)}</div><div style="margin-top:10px">Solde initial : <strong>${euro(p.value_cents)}</strong></div></div><p>Conservez ce code. Il peut être utilisé en plusieurs fois, sur la boutique en ligne ou directement en boutique.</p><p>L’Atelier du Goût<br>3 place Aristide Briand · 17470 Aulnay-de-Saintonge</p></div></div>`;
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

  /*
   * Récupération défensive :
   * si Mollie a créé le paiement mais que son identifiant n'a pas pu
   * être enregistré localement lors du checkout, le webhook peut
   * rattacher le paiement grâce à orderId + orderRef.
   */
  let linked = await sql`
    SELECT *
    FROM orders
    WHERE mollie_payment_id=${id}
    LIMIT 1
  `;

  if (!linked[0]) {
    const metadataOrderId = String(p?.metadata?.orderId || "").trim();
    const metadataOrderRef = String(p?.metadata?.orderRef || "").trim();

    if (/^\d+$/.test(metadataOrderId) && metadataOrderRef) {
      const candidates = await sql`
        SELECT *
        FROM orders
        WHERE id=${metadataOrderId}
          AND order_ref=${metadataOrderRef}
        LIMIT 1
      `;

      const candidate = candidates[0];

      if (candidate) {
        const mollieCents = Math.round(
          Number(p?.amount?.value || 0) * 100
        );

        const expectedCents = Number(candidate.mollie_due_cents);

        if (
          p?.amount?.currency === "EUR" &&
          Number.isInteger(mollieCents) &&
          mollieCents === expectedCents
        ) {
          linked = await sql`
            UPDATE orders
            SET mollie_payment_id=${id}
            WHERE id=${candidate.id}
              AND order_ref=${candidate.order_ref}
              AND (
                mollie_payment_id IS NULL
                OR mollie_payment_id=${id}
              )
            RETURNING *
          `;

          if (linked[0]) {
            console.log(
              "Paiement Mollie rattaché via metadata:",
              linked[0].order_ref
            );
          }
        } else {
          console.error(
            "Webhook Mollie: montant/devise incohérent pour",
            candidate.order_ref
          );
        }
      }
    }
  }

  /*
   * Vérification globale du montant et de la devise.
   * Elle s'applique aussi aux commandes retrouvées directement
   * par mollie_payment_id, pas seulement au rattachement via metadata.
   */
  if (linked[0]) {
    const mollieCents = Math.round(
      Number(p?.amount?.value || 0) * 100
    );
    const expectedCents = Number(linked[0].mollie_due_cents);

    if (
      p?.amount?.currency !== "EUR" ||
      !Number.isInteger(mollieCents) ||
      !Number.isInteger(expectedCents) ||
      mollieCents !== expectedCents
    ) {
      console.error(
        "Webhook Mollie refusé : montant/devise incohérent",
        {
          orderRef: linked[0].order_ref,
          paymentId: id,
          mollieCents,
          expectedCents,
          currency: p?.amount?.currency
        }
      );

      return new Response(
        "Payment amount/currency mismatch",
        { status: 400 }
      );
    }
  }

  /*
   * Le paiement est enregistré ou actualisé de façon idempotente.
   * On ne crée une ligne que si une commande a réellement été reliée.
   */
  if (linked[0]) {
    await sql`
      INSERT INTO payments(
        order_id,
        provider_payment_id,
        status,
        amount_cents
      )
      VALUES(
        ${linked[0].id},
        ${id},
        ${status},
        ${Number(linked[0].mollie_due_cents) || 0}
      )
      ON CONFLICT (provider_payment_id)
      DO UPDATE SET
        status=EXCLUDED.status,
        updated_at=NOW()
    `;
  } else {
    await sql`
      UPDATE payments
      SET status=${status},
          updated_at=NOW()
      WHERE provider_payment_id=${id}
    `;
  }

  if(status==="paid"){
    const rows=await sql`UPDATE orders SET status='paid',paid_at=COALESCE(paid_at,NOW()) WHERE mollie_payment_id=${id} RETURNING *`;
    if(rows[0]){
      try{
        await applyStock(sql,rows[0]);
      }catch(e){
        console.error("Déstockage:",e);
        return new Response('Erreur déstockage',{status:500});
      }
      await sql`
        SELECT apply_loyalty_for_order(
          ${rows[0].id},
          ${rows[0].order_ref}
        )
      `;
      await sql`
        SELECT apply_gift_card_for_order(
          ${rows[0].id},
          ${rows[0].order_ref}
        )
      `;
      try{ await ensureEmailTable(sql); await sendOrderEmails(sql,rows[0]); } catch(e){ console.error("Traitement emails:",e); }
      try{ await creditOrderPoints(sql,rows[0]); } catch(e){ console.error("Fidélité:",e); }
      try{ await sendNewOrderPush(rows[0]); } catch(e){ console.error("Notification push:",e); }
    }
  } else if(["failed","canceled","expired"].includes(status)){
    const orders=await sql`UPDATE orders SET status=${status} WHERE mollie_payment_id=${id} AND status<>'paid' RETURNING id,order_ref`;
    if(orders[0]){
      await sql`
        SELECT release_gift_card_for_order(
          ${orders[0].id}
        )
      `;
      await sql`
        SELECT release_loyalty_for_order(
          ${orders[0].id}
        )
      `;
        try{
          await releaseStock(orders[0].order_ref);
        }catch(e){
          console.error('Libération réservation stock:',e);
        }
    }
  }
  return new Response("OK",{status:200});
};
