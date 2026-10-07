import fs from "node:fs";

const file = "netlify/functions/create-payment.mjs";
let src = fs.readFileSync(file, "utf8");

function replaceRegex(label, regex, replacement) {
  const matches = src.match(regex);

  if (!matches) {
    throw new Error(`${label}: bloc introuvable`);
  }

  src = src.replace(regex, replacement);
  console.log(`OK - ${label}`);
}

/* 1. maxOrders accessible après le bloc de validation du créneau */
replaceRegex(
  "déclaration maxOrders",
  /(\n\s*)try\{\s*\n(\s*)const settingsRow=/,
  `$1let maxOrders=6;\n\n$1try{\n$2const settingsRow=`
);

/* 2. Supprimer l'ancien check-then-insert non atomique */
replaceRegex(
  "ancien contrôle capacité",
  /\s*const maxOrders=Math\.max\(1,Math\.min\(99,Number\(settings\.max_orders_per_slot\|\|6\)\)\);\s*const countRows=await sql`[\s\S]*?status IN \('paid','preparing','ready','completed'\)\s*`;\s*if\(Number\(countRows\[0\]\?\.count\|\|0\)>=maxOrders\)\{\s*return reply\(\{error:'Ce créneau est complet\. Choisissez un autre horaire\.'\},409\);\s*\}/,
  `
   maxOrders=Math.max(
     1,
     Math.min(99,Number(settings.max_orders_per_slot||6))
   );`
);

/* 3. Remplacer la création directe de la commande */
replaceRegex(
  "création atomique commande",
  / const total=sub\+delivery,ref=`ADG-\$\{Date\.now\(\)\}`;let row;try\{const c=o\.customer\|\|\{\};\[row\]=await sql`INSERT INTO orders[\s\S]*?\}catch\(e\)\{console\.error\(e\);return reply\(\{error:'Impossible d’enregistrer la commande\.'\},500\)\}/,
` const total=sub+delivery,ref=\`ADG-\${Date.now()}\`;
 let row;

 try{
   const c=o.customer||{};

   const reserved=await sql\`
     SELECT reserve_order_slot(
       \${mode},
       \${serviceDate},
       \${serviceSlot},
       \${maxOrders},
       \${ref},
       \${o.zone||null},
       \${c.name||o.name||null},
       \${c.phone||o.phone||null},
       \${c.email||o.email||null},
       \${c.address||o.address||null},
       \${o.comments||null},
       \${o.allergies||null},
       \${sub},
       \${delivery},
       \${total}
     ) AS id
   \`;

   if(!reserved[0]?.id){
     return reply({
       error:'Ce créneau est complet. Choisissez un autre horaire.'
     },409);
   }

   row={id:reserved[0].id};

   try{
     for(const x of items){
       await sql\`
         INSERT INTO order_items(
           order_id,
           product_key,
           product_name,
           quantity,
           unit_price_cents,
           line_total_cents
         )
         VALUES(
           \${row.id},
           \${x.key},
           \${x.name},
           \${x.q},
           \${x.pc},
           \${x.line}
         )
       \`;
     }
   }catch(e){
     await sql\`
       UPDATE orders
       SET status='order_creation_failed'
       WHERE id=\${row.id}
         AND status='pending_payment'
     \`;
     throw e;
   }
 }catch(e){
   console.error(e);
   return reply({error:'Impossible d’enregistrer la commande.'},500);
 }`
);

/* 4. Ne pas bloquer une place si Mollie n'est pas configuré */
replaceRegex(
  "échec clé Mollie",
  /if\(!process\.env\.MOLLIE_API_KEY\)\{await releaseGift\(sql,row\.id\);await releaseLoyalty\(sql,row\.id\);return reply\(\{error:'Clé Mollie absente\.'\},500\)\}/,
`if(!process.env.MOLLIE_API_KEY){
  await releaseGift(sql,row.id);
  await releaseLoyalty(sql,row.id);
  await sql\`
    UPDATE orders
    SET status='payment_creation_failed'
    WHERE id=\${row.id}
      AND status='pending_payment'
  \`;
  return reply({error:'Clé Mollie absente.'},500);
}`
);

fs.writeFileSync(file, src);
console.log("OK - create-payment.mjs écrit.");
