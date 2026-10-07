import { createClient } from "@supabase/supabase-js";
import { loyaltyTokenFromRequest } from './loyalty-session-cookie.mjs';
import { db } from './db.mjs';
import { createHash } from 'node:crypto';
import { ensureEmailTable, sendOrderEmails } from './order-emails.mjs';
import { creditOrderPoints, ensureLoyalty, hash as loyaltyHash, norm } from './loyalty.mjs';
import { LOYALTY_REWARD_MAP } from './loyalty-rewards.mjs';
import {
  rateLimit,
  rateLimitResponse,
  bodyTooLarge,
  securityEvent
} from './security-guard.mjs';
const reply=(x,s=200)=>Response.json(x,{status:s}); const cents=n=>Math.round(Number(n)*100); const giftHash=s=>createHash('sha256').update(String(s).trim().toUpperCase()).digest('hex');

async function catalogue(){const supabase=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);const {data,error}=await supabase.from("products").select("*").eq("active",true);if(error)throw error;return data||[];}
function stockClient(){
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

async function reserveStock(sql,orderId,orderRef){
  const items=await sql`
    SELECT product_key,quantity
    FROM order_items
    WHERE order_id=${orderId}
  `;

  const {data,error}=await stockClient().rpc('reserve_order_stock',{
    p_order_ref:orderRef,
    p_items:items.map(x=>({
      product_id:x.product_key,
      quantity:x.quantity
    })),
    p_expires_at:new Date(Date.now()+30*60*1000).toISOString()
  });

  if(error)throw error;
  return data;
}

async function releaseStock(orderRef){
  const {data,error}=await stockClient().rpc('release_order_stock',{
    p_order_ref:orderRef
  });

  if(error)throw error;
  return data;
}

async function applyStock(sql,orderId,orderRef){
  const {data,error}=await stockClient().rpc('consume_order_stock',{
    p_order_ref:orderRef
  });

  if(error)throw error;

  await sql`
    UPDATE orders
    SET stock_applied_at=COALESCE(stock_applied_at,NOW())
    WHERE id=${orderId}
  `;

  return data;
}

async function setStockReservationExpiry(orderRef,expiresAt){
  if(!expiresAt)return;

  const {error}=await stockClient()
    .from('stock_reservations')
    .update({
      expires_at:expiresAt,
      updated_at:new Date().toISOString()
    })
    .eq('order_ref',orderRef)
    .eq('status','reserved');

  if(error)throw error;
}

const keys=p=>[p.id,p.slug,p.sku,p.name,p.title].filter(Boolean).map(String), price=p=>Number(p.price??p.prix??p.unitPrice??p.unit_price);
async function releaseGift(sql,orderId){
  await sql`
    SELECT release_gift_card_for_order(${orderId})
  `;
}
async function applyGift(sql,orderId,ref){
  await sql`
    SELECT apply_gift_card_for_order(
      ${orderId},
      ${ref}
    )
  `;
}

async function releaseLoyalty(sql, orderId) {
  await sql`
    SELECT release_loyalty_for_order(${orderId})
  `;
}


async function applyLoyalty(sql, orderId, ref) {
  await sql`
    SELECT apply_loyalty_for_order(${orderId}, ${ref})
  `;
}


async function reserveLoyalty(sql, o, orderId, total, loyaltyToken) {
  const points = Number(o.loyalty_reward_points || 0);

  if (!points) {
    return { points: 0, discount: 0, accountId: null };
  }

  const discount = LOYALTY_REWARD_MAP.get(points);

  if (!discount) {
    throw Object.assign(
      Error('Récompense fidélité invalide.'),
      { status: 400 }
    );
  }

  if (total < discount) {
    throw Object.assign(
      Error('Montant insuffisant pour cette récompense.'),
      { status: 400 }
    );
  }

  const token = String(loyaltyToken || '');

  if (!token) {
    throw Object.assign(
      Error('Reconnectez-vous à votre compte fidélité.'),
      { status: 401 }
    );
  }

  await ensureLoyalty(sql);

  const sessions = await sql`
    SELECT s.account_id, a.email
    FROM loyalty_sessions s
    JOIN loyalty_accounts a ON a.id = s.account_id
    WHERE s.token_hash = ${loyaltyHash(token)}
      AND s.expires_at > NOW()
    LIMIT 1
  `;

  const session = sessions[0];

  if (!session) {
    throw Object.assign(
      Error('Session fidélité expirée.'),
      { status: 401 }
    );
  }

  const email = norm(o.customer?.email || o.email);

  if (!email || email !== norm(session.email)) {
    throw Object.assign(
      Error('Utilisez l’adresse email du compte fidélité.'),
      { status: 400 }
    );
  }

  try {
    await sql`
      SELECT *
      FROM reserve_loyalty_for_order(
        ${orderId},
        ${session.account_id},
        ${points},
        ${discount}
      )
    `;
  } catch (error) {
    if (String(error.message).includes('LOYALTY_INSUFFICIENT_POINTS')) {
      throw Object.assign(
        Error('Vous n’avez plus assez de points.'),
        { status: 409 }
      );
    }
    throw error;
  }

  return {
    points,
    discount,
    accountId: session.account_id
  };
}

export default async(req)=>{if(req.method!=='POST')return reply({error:'Méthode non autorisée.'},405);

  if (bodyTooLarge(req, 100_000)) {
    return reply({error:'Requête trop volumineuse.'},413);
  }

  const paymentLimit = rateLimit(req, {
    namespace: 'payment-create',
    limit: 20,
    windowMs: 15 * 60 * 1000
  });

  if (!paymentLimit.allowed) {
    securityEvent(
      'payment-create_limited',
      '',
      'Trop de créations de paiement'
    );

    return rateLimitResponse(paymentLimit);
  }let b;try{b=await req.json()}catch{return reply({error:'Requête invalide.'},400)}const o=b.order;if(!o||!Array.isArray(o.items)||!o.items.length)return reply({error:'Panier vide.'},400);const sql=db();
 const loyaltyToken=loyaltyTokenFromRequest(req,{
   token:o.loyalty_token
 });
 let products;try{products=await catalogue(req)}catch(e){return reply({error:e.message},500)}const map=new Map();for(const p of products)for(const k of keys(p))map.set(k,p);let sub=0,items=[];for(const i of o.items){const k=String(i.id??i.slug??i.sku??i.name??i.title??''),p=map.get(k);if(!p)return reply({error:`Produit non reconnu : ${k||'sans identifiant'}`},400);const q=Math.max(1,Math.min(99,parseInt(i.qty??i.quantity??1)||1)),pc=cents(price(p));if(p.stock!==null&&p.stock!==undefined&&q>Number(p.stock))return reply({error:`Stock insuffisant pour ${p.name??p.title??k}. Disponible : ${p.stock}.`},409);sub+=pc*q;items.push({key:String(p.id),name:p.name??p.title??k,q,pc,line:pc*q,alcohol:p.alcohol===true})}

 if(o.cgv_accepted!==true){
   return reply({error:'Vous devez accepter les conditions générales de vente.'},400);
 }

 const containsAlcohol=items.some(item=>item.alcohol===true);

 if(containsAlcohol&&o.age18_confirmed!==true){
   return reply({error:'La confirmation de majorité est obligatoire pour commander de l’alcool.'},400);
 }

 const mode=String(o.mode||'pickup');

 const serviceDate=String(o.date||'');
 const serviceSlot=String(o.slot||'');

 if(!['pickup','delivery'].includes(mode)){
   return reply({error:'Mode de commande invalide.'},400);
 }

 if(!/^\d{4}-\d{2}-\d{2}$/.test(serviceDate)||!serviceSlot){
   return reply({error:'Date ou créneau invalide.'},400);
 }

 let maxOrders=6;



 try{
   const settingsRow=(await sql`
     SELECT settings
     FROM site_settings
     WHERE id='orders'
     LIMIT 1
   `)[0];

   const settings=settingsRow?.settings||{};
   const enabled=mode==='pickup'
     ? settings.pickup_enabled!==false
     : settings.delivery_enabled!==false;

   if(!enabled){
     return reply({error:mode==='pickup'?'Le retrait est actuellement indisponible.':'La livraison est actuellement indisponible.'},409);
   }

   const closedDates=Array.isArray(settings.closed_dates)?settings.closed_dates:[];
   if(closedDates.includes(serviceDate)){
     return reply({error:'Les commandes sont fermées à cette date.'},409);
   }

   const date=new Date(serviceDate+'T12:00:00Z');
   if(Number.isNaN(date.getTime())){
     return reply({error:'Date de commande invalide.'},400);
   }

   const day=String(date.getUTCDay());
   const allowedSlots=settings.weekly?.[day]?.[mode]||[];

   if(!Array.isArray(allowedSlots)||!allowedSlots.includes(serviceSlot)){
     return reply({error:'Ce créneau n’est pas disponible.'},409);
   }
   maxOrders=Math.max(
     1,
     Math.min(99,Number(settings.max_orders_per_slot||6))
   );
 }catch(e){
   console.error('Contrôle créneau:',e);
   return reply({error:'Impossible de vérifier la disponibilité du créneau.'},500);
 }

 let delivery=0;if(mode==='delivery'){const zone=String(o.zone||''),fees={'aulnay':350,'10km':500,'10-15km':750,'Aulnay':350,'Jusqu’à 10 km':500,'10 à 15 km':750,'3.5':350,'5':500,'7.5':750};if(!(zone in fees))return reply({error:'Zone de livraison invalide.'},400);if(sub<2000)return reply({error:'Minimum de commande pour livraison : 20 €.'},400);delivery=fees[zone]}
 const total=sub+delivery,ref=`ADG-${Date.now()}`;
 let row;

 try{
   const c=o.customer||{};

   const reserved=await sql`
     SELECT reserve_order_slot(
       ${mode},
       ${serviceDate},
       ${serviceSlot},
       ${maxOrders},
       ${ref},
       ${o.zone||null},
       ${c.name||o.name||null},
       ${c.phone||o.phone||null},
       ${c.email||o.email||null},
       ${c.address||o.address||null},
       ${o.comments||null},
       ${o.allergies||null},
       ${sub},
       ${delivery},
       ${total}
     ) AS id
   `;

   if(!reserved[0]?.id){
     return reply({
       error:'Ce créneau est complet. Choisissez un autre horaire.'
     },409);
   }

   row={id:reserved[0].id};

   try{
     for(const x of items){
       await sql`
         INSERT INTO order_items(
           order_id,
           product_key,
           product_name,
           quantity,
           unit_price_cents,
           line_total_cents
         )
         VALUES(
           ${row.id},
           ${x.key},
           ${x.name},
           ${x.q},
           ${x.pc},
           ${x.line}
         )
       `;
     }
   }catch(e){
     await sql`
       UPDATE orders
       SET status='order_creation_failed'
       WHERE id=${row.id}
         AND status='pending_payment'
     `;
     throw e;
   }
 }catch(e){
   console.error(e);
   return reply({error:'Impossible d’enregistrer la commande.'},500);
 }
 try{
  await reserveStock(sql,row.id,ref);
}catch(e){
  console.error('Réservation stock:',e);

  await sql`
    UPDATE orders
    SET status='stock_unavailable'
    WHERE id=${row.id}
      AND status='pending_payment'
  `;

  const message=String(e?.message||'');

  if(message.includes('STOCK_INSUFFICIENT')){
    return reply({
      error:'Un produit de votre panier vient de devenir indisponible. Actualisez votre panier.'
    },409);
  }

  return reply({
    error:'Impossible de réserver le stock de cette commande.'
  },500);
}

let loyalty={points:0,discount:0};try{loyalty=await reserveLoyalty(sql,o,row.id,total,loyaltyToken)}catch(e){await releaseStock(ref);await sql`UPDATE orders SET status='loyalty_invalid' WHERE id=${row.id}`;return reply({error:e.message},e.status||500)}
 let gift=0;
 const code=String(o.gift_code||'').trim().toUpperCase();
 const afterLoyalty=total-loyalty.discount;

 if(code){
   try{
     const reservedGift=await sql`
       SELECT *
       FROM reserve_gift_card_for_order(
         ${row.id},
         ${giftHash(code)},
         ${afterLoyalty}
       )
     `;

     if(!reservedGift[0]){
       throw Object.assign(
         Error('Carte cadeau invalide ou sans solde.'),
         {status:400}
       );
     }

     gift=Number(reservedGift[0].amount_cents||0);

   }catch(e){
     await releaseLoyalty(sql,row.id);
     await releaseStock(ref);

     const message=String(e?.message||'');

     if(message.includes('GIFT_INVALID')){
       await sql`
         UPDATE orders
         SET status='gift_invalid'
         WHERE id=${row.id}
           AND status='pending_payment'
       `;

       return reply({
         error:'Carte cadeau invalide ou sans solde.'
       },400);
     }

     if(
       message.includes('gift_card_redemptions_order_id_key') ||
       message.includes('duplicate key')
     ){
       await sql`
         UPDATE orders
         SET status='gift_conflict'
         WHERE id=${row.id}
           AND status='pending_payment'
       `;

       return reply({
         error:'Cette carte cadeau est déjà réservée pour cette commande.'
       },409);
     }

     console.error('Réservation carte cadeau:',e);

     await sql`
       UPDATE orders
       SET status='gift_conflict'
       WHERE id=${row.id}
         AND status='pending_payment'
     `;

     return reply({
       error:'Impossible de réserver cette carte cadeau.'
     },409);
   }
 }
 const due=afterLoyalty-gift;await sql`UPDATE orders SET mollie_due_cents=${due} WHERE id=${row.id}`;const site=process.env.SITE_PUBLIC_URL||process.env.URL||new URL(req.url).origin;if(due===0){await sql`UPDATE orders SET status='paid',paid_at=NOW() WHERE id=${row.id}`;try{await applyStock(sql,row.id,ref)}catch(e){console.error('Déstockage:',e);await sql`UPDATE orders SET status='stock_error' WHERE id=${row.id}`;await releaseGift(sql,row.id);await releaseLoyalty(sql,row.id);return reply({error:'Impossible de valider le stock de cette commande.'},409)}await applyGift(sql,row.id,ref);await applyLoyalty(sql,row.id,ref);const full=(await sql`SELECT * FROM orders WHERE id=${row.id}`)[0];try{await ensureEmailTable(sql);await sendOrderEmails(sql,full)}catch(e){console.error(e)} try{await creditOrderPoints(sql,full)}catch(e){console.error('Fidélité:',e)}return reply({redirectUrl:`${site}/paiement-retour.html?ref=${encodeURIComponent(ref)}`,orderRef:ref,giftAppliedCents:gift,loyaltyDiscountCents:loyalty.discount,paidWithoutMollie:true});}
 if(!process.env.MOLLIE_API_KEY){
  await releaseGift(sql,row.id);
  await releaseLoyalty(sql,row.id);
  await releaseStock(ref);
  await sql`
    UPDATE orders SET status='payment_creation_failed'
    WHERE id=${row.id}
      AND status='pending_payment'
  `;
  return reply({error:'Clé Mollie absente.'},500);
}const payload = {
  amount: {
    currency: 'EUR',
    value: (due / 100).toFixed(2)
  },
  description: `L'Atelier du Goût - ${ref}`,
  redirectUrl: `${site}/paiement-retour.html?ref=${encodeURIComponent(ref)}`,
  webhookUrl: `${site}/.netlify/functions/mollie-webhook`,
  locale: 'fr_FR',
  metadata: {
    orderRef: ref,
    orderId: String(row.id),
    mode
  }
};

let r;
let p;

try {
  r = await fetch('https://api.mollie.com/v2/payments', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.MOLLIE_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  p = await r.json();
} catch (error) {
  console.error('Création paiement Mollie:', error);

  await releaseGift(sql, row.id);
  await releaseLoyalty(sql, row.id);
  await releaseStock(ref);

  await sql`
    UPDATE orders
    SET status='payment_creation_failed'
    WHERE id=${row.id}
      AND status='pending_payment'
  `;

  return reply({
    error: 'Impossible de contacter le service de paiement.'
  }, 502);
}

if (!r.ok || !p?.id) {
  await releaseGift(sql, row.id);
  await releaseLoyalty(sql, row.id);
  await releaseStock(ref);

  await sql`
    UPDATE orders
    SET status='payment_creation_failed'
    WHERE id=${row.id}
      AND status='pending_payment'
  `;

  return reply({
    error: 'Mollie a refusé la création du paiement.'
  }, 502);
}

const mollieExpiresAt =
  typeof p?.expiresAt === "string" && !Number.isNaN(Date.parse(p.expiresAt))
    ? p.expiresAt
    : null;

await sql`
  UPDATE orders
  SET mollie_payment_id=${p.id},
      payment_expires_at=${mollieExpiresAt}
  WHERE id=${row.id}
`;

await sql`
  INSERT INTO payments(
    order_id,
    provider_payment_id,
    status,
    amount_cents
  )
  VALUES(
    ${row.id},
    ${p.id},
    ${p.status || 'open'},
    ${due}
  )
`;

return reply({
  checkoutUrl: p?._links?.checkout?.href,
  paymentId: p.id,
  orderRef: ref,
  giftAppliedCents: gift,
  loyaltyDiscountCents: loyalty.discount,
  mollieDueCents: due
});
};
