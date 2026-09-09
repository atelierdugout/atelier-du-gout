import { db } from './db.mjs'; import { sendLoginCode,norm } from './loyalty.mjs';
const reply=(x,s=200)=>Response.json(x,{status:s,headers:{'Cache-Control':'no-store'}});
export default async req=>{if(req.method!=='POST')return reply({error:'Méthode non autorisée.'},405);try{const b=await req.json(),email=norm(b.email);if(!/^\S+@\S+\.\S+$/.test(email))return reply({error:'Adresse email invalide.'},400);await sendLoginCode(db(),email);return reply({ok:true,message:'Code envoyé par email.'});}catch(e){console.error(e);return reply({error:'Impossible d’envoyer le code.'},500)}};
