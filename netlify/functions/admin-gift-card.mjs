import { db } from './db.mjs';
import { createHash } from 'node:crypto';
import { hasAdminAccess } from "./admin-session.mjs";
const reply=(x,s=200)=>Response.json(x,{status:s,headers:{'Cache-Control':'no-store'}});
const hash=s=>createHash('sha256').update(String(s).trim().toUpperCase()).digest('hex');

export default async(req)=>{
  if(req.method!=='POST') return reply({error:'Méthode non autorisée.'},405);
  let b; try{b=await req.json()}catch{return reply({error:'Requête invalide.'},400)}
  if(!hasAdminAccess(req)) return reply({error:'Authentification administrateur requise.'},401);
  const code=String(b.code||'').trim().toUpperCase();
  if(!code) return reply({error:'Saisissez le code de la carte cadeau.'},400);
  try{
    const sql=db();
    const cards=await sql`SELECT gc.id,gc.code_last4,gc.initial_cents,gc.balance_cents,gc.status,gc.issued_at,gc.expires_at,gp.purchase_ref,gp.buyer_name,gp.buyer_email,gp.recipient_name,gp.recipient_email FROM gift_cards gc JOIN gift_purchases gp ON gp.id=gc.purchase_id WHERE gc.code_hash=${hash(code)} LIMIT 1`;
    if(!cards[0]) return reply({error:'Carte cadeau introuvable.'},404);
    const c=cards[0];
    const history=await sql`SELECT event_type,amount_cents,order_ref,note,created_at FROM gift_card_ledger WHERE gift_card_id=${c.id} ORDER BY created_at DESC,id DESC LIMIT 100`;
    return reply({ok:true,card:{...c,id:undefined},history});
  }catch(e){console.error(e);return reply({error:'Consultation impossible.'},500)}
};
