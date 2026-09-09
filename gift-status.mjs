import { db } from './db.mjs';
const reply=(x,s=200)=>Response.json(x,{status:s});
export default async(req)=>{
  const ref=new URL(req.url).searchParams.get('ref');
  if(!ref) return reply({error:'Référence manquante.'},400);
  const sql=db();
  try{
    const rows=await sql`SELECT purchase_ref,status,value_cents,recipient_name,recipient_email,send_mode,send_date,paid_at,recipient_email_sent_at FROM gift_purchases WHERE purchase_ref=${ref} LIMIT 1`;
    if(!rows[0]) return reply({error:'Carte cadeau introuvable.'},404);
    return reply({ok:true,...rows[0]});
  }catch(e){ return reply({error:'Statut indisponible.'},500); }
};
