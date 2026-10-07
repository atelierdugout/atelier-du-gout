import { db } from "./db.mjs";
import {
  rateLimit,
  rateLimitResponse,
  bodyTooLarge,
  securityEvent
} from "./security-guard.mjs";

const reply=(body,status=200)=>Response.json(body,{status,headers:{"Cache-Control":"no-store"}});

export default async(req)=>{
  if(req.method!=="GET") return reply({error:"Méthode non autorisée."},405);

  const statusLimit=rateLimit(req,{
    namespace:"order-status",
    limit:60,
    windowMs:15*60*1000
  });

  if(!statusLimit.allowed){
    securityEvent("order_status_limited","","Trop de consultations de statut");
    return rateLimitResponse(statusLimit);
  }
  const ref=new URL(req.url).searchParams.get("ref")?.trim();
  if(!ref || !/^ADG-\d{10,}$/.test(ref)) return reply({error:"Référence invalide."},400);
  try{
    const sql=db();
    const rows=await sql`SELECT order_ref,status,COALESCE(fulfillment_status, 'new') AS fulfillment_status,mode,service_date,service_slot,total_cents FROM orders WHERE order_ref=${ref} LIMIT 1`;
    if(!rows[0]) return reply({error:"Commande introuvable."},404);
    return reply(rows[0]);
  }catch(e){
    console.error("order-status",e);
    return reply({error:"Impossible de vérifier la commande."},500);
  }
};
