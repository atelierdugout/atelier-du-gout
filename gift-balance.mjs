import { db } from './db.mjs';
import { createHash } from 'node:crypto';
const reply=(x,s=200)=>Response.json(x,{status:s,headers:{'Cache-Control':'no-store'}});
const hash=s=>createHash('sha256').update(String(s).trim().toUpperCase()).digest('hex');
export default async(req)=>{if(req.method!=='POST')return reply({error:'Méthode non autorisée.'},405);let b;try{b=await req.json()}catch{return reply({error:'Requête invalide.'},400)}const code=String(b.code||'').trim().toUpperCase();if(!code)return reply({error:'Saisissez un code cadeau.'},400);try{const sql=db();const r=await sql`SELECT balance_cents,status FROM gift_cards WHERE code_hash=${hash(code)} LIMIT 1`;if(!r[0]||r[0].status!=='active'||r[0].balance_cents<=0)return reply({valid:false,error:'Carte cadeau invalide ou sans solde.'},404);return reply({valid:true,balance_cents:r[0].balance_cents});}catch(e){console.error(e);return reply({error:'Vérification impossible.'},500)}};
