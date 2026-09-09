import { db } from "./db.mjs";

const reply=(body,status=200)=>Response.json(body,{status,headers:{"Cache-Control":"no-store"}});

export default async(req)=>{
  if(req.method!=="GET") return reply({error:"Méthode non autorisée."},405);
  const ref=new URL(req.url).searchParams.get("ref")?.trim();
  if(!ref || !/^ADG-\d{10,}$/.test(ref)) return reply({error:"Référence invalide."},400);
  try{
    const sql=db();
    const rows=await sql`SELECT order_ref,status,mode,service_date,service_slot,total_cents FROM orders WHERE order_ref=${ref} LIMIT 1`;
    if(!rows[0]) return reply({error:"Commande introuvable."},404);
    return reply(rows[0]);
  }catch(e){
    console.error("order-status",e);
    return reply({error:"Impossible de vérifier la commande."},500);
  }
};
