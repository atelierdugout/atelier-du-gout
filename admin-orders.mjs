import { db } from './db.mjs';
const reply=(x,s=200)=>Response.json(x,{status:s,headers:{'Cache-Control':'no-store'}});
const auth=req=>{const expected=String(process.env.ADMIN_PIN||'');const got=String(req.headers.get('x-admin-pin')||'');return expected && got===expected};
const allowed=new Set(['new','preparing','ready','completed']);
export default async(req)=>{
  if(!auth(req)) return reply({error:process.env.ADMIN_PIN?'Code administrateur incorrect.':'ADMIN_PIN non configuré.'},401);
  const sql=db();
  if(req.method==='GET'){
    const u=new URL(req.url), scope=u.searchParams.get('scope')||'upcoming', mode=u.searchParams.get('mode')||'all';
    let rows;
    if(scope==='today') rows=await sql`SELECT * FROM orders WHERE status IN ('paid','preparing','ready','completed') AND service_date=CURRENT_DATE::text ORDER BY service_slot NULLS LAST, created_at DESC LIMIT 200`;
    else if(scope==='all') rows=await sql`SELECT * FROM orders WHERE status IN ('paid','preparing','ready','completed') ORDER BY service_date DESC NULLS LAST, service_slot DESC NULLS LAST, created_at DESC LIMIT 200`;
    else rows=await sql`SELECT * FROM orders WHERE status IN ('paid','preparing','ready') AND (service_date IS NULL OR service_date>=CURRENT_DATE::text) ORDER BY service_date NULLS LAST, service_slot NULLS LAST, created_at DESC LIMIT 200`;
    if(mode!=='all') rows=rows.filter(r=>r.mode===mode);
    const ids=rows.map(r=>r.id); let items=[];
    if(ids.length) items=await sql`SELECT * FROM order_items WHERE order_id = ANY(${ids}::bigint[]) ORDER BY order_id,id`;
    const by=new Map(); for(const i of items){if(!by.has(String(i.order_id)))by.set(String(i.order_id),[]);by.get(String(i.order_id)).push(i)}
    return reply({ok:true,orders:rows.map(o=>({...o,items:by.get(String(o.id))||[]}))});
  }
  if(req.method==='POST'){
    let b;try{b=await req.json()}catch{return reply({error:'Requête invalide.'},400)}
    const id=Number(b.order_id), status=String(b.status||''); if(!id||!allowed.has(status))return reply({error:'Statut ou commande invalide.'},400);
   try {
  const r = await sql`
    UPDATE orders
    SET fulfillment_status = ${status}
    WHERE id = ${id}
    RETURNING id, order_ref, fulfillment_status
  `;

  if (!r.length) {
    return reply({ error: 'Commande introuvable.' }, 404);
  }

  return reply({ ok: true, order: r[0] });

} catch (err) {

  console.error(err);

  return reply({
    error: err.message,
    detail: err
  }, 500);

}
  }
  return reply({error:'Méthode non autorisée.'},405);
};
