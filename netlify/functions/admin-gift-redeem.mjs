import { db } from './db.mjs';
import { createHash } from 'node:crypto';
import { hasAdminAccess } from "./admin-session.mjs";
const reply=(x,s=200)=>Response.json(x,{status:s,headers:{'Cache-Control':'no-store'}});
const hash=s=>createHash('sha256').update(String(s).trim().toUpperCase()).digest('hex');
export default async(req)=>{
 if(req.method!=='POST')return reply({error:'Méthode non autorisée.'},405);
 let b;try{b=await req.json()}catch{return reply({error:'Requête invalide.'},400)}
 if (!hasAdminAccess(req)) return reply({error:'Authentification administrateur requise.'},401);
 const code=String(b.code||'').trim().toUpperCase(); const cents=Math.round(Number(b.amount)*100); const note=String(b.note||'Débit en boutique').trim().slice(0,300);
 if(!code||!Number.isInteger(cents)||cents<=0)return reply({error:'Code ou montant invalide.'},400);
 try{const sql=db();
   const rows=await sql`WITH target AS (
      SELECT id FROM gift_cards WHERE code_hash=${hash(code)} AND status='active' AND balance_cents>=${cents} FOR UPDATE
    ), upd AS (
      UPDATE gift_cards g SET balance_cents=g.balance_cents-${cents},status=CASE WHEN g.balance_cents-${cents}=0 THEN 'depleted' ELSE 'active' END,updated_at=NOW()
      FROM target t WHERE g.id=t.id RETURNING g.id,g.balance_cents,g.status
    ), led AS (
      INSERT INTO gift_card_ledger(gift_card_id,event_type,amount_cents,note)
      SELECT id,'store_redeemed',${-cents},${note} FROM upd RETURNING id
    ) SELECT id,balance_cents,status FROM upd`;
   if(!rows[0])return reply({error:'Carte invalide, inactive ou solde insuffisant.'},409);
   return reply({ok:true,balance_cents:rows[0].balance_cents,status:rows[0].status});
 }catch(e){console.error(e);return reply({error:'Débit impossible.'},500)}
};
