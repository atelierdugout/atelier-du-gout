import { createClient } from '@supabase/supabase-js';

const supabase=createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const refRelease='TEST-STOCK-CYCLE-RELEASE';
const refConsume='TEST-STOCK-CYCLE-CONSUME';

function fail(msg){
  throw new Error(msg);
}

async function rpc(name,args){
  const {data,error}=await supabase.rpc(name,args);
  if(error)throw error;
  return data;
}

const {data:products,error:productError}=await supabase
  .from('products')
  .select('id,name,stock')
  .eq('active',true)
  .not('stock','is',null)
  .gt('stock',1)
  .limit(1);

if(productError)throw productError;
if(!products?.length)fail('Aucun produit testable.');

const product=products[0];
const initial=Number(product.stock);

console.log(`Produit test : ${product.name}`);
console.log(`Stock initial : ${initial}`);

/* nettoyage préventif */
await rpc('release_order_stock',{p_order_ref:refRelease});
await rpc('release_order_stock',{p_order_ref:refConsume});

await supabase.from('stock_reservations')
  .delete()
  .in('order_ref',[refRelease,refConsume]);

await supabase.from('stock_events')
  .delete()
  .eq('order_ref',refConsume);


/* TEST 1 : réservation puis libération */
await rpc('reserve_order_stock',{
  p_order_ref:refRelease,
  p_items:[{
    product_id:product.id,
    quantity:1
  }],
  p_expires_at:new Date(Date.now()+30*60*1000).toISOString()
});

let {data:r1,error:r1e}=await supabase
  .from('stock_reservations')
  .select('status,quantity')
  .eq('order_ref',refRelease)
  .single();

if(r1e)throw r1e;
if(r1.status!=='reserved')fail('La réservation n’est pas active.');

console.log('OK - réservation créée.');

await rpc('release_order_stock',{
  p_order_ref:refRelease
});

({data:r1,error:r1e}=await supabase
  .from('stock_reservations')
  .select('status')
  .eq('order_ref',refRelease)
  .single());

if(r1e)throw r1e;
if(r1.status!=='released')fail('La réservation n’a pas été libérée.');

console.log('OK - réservation libérée.');


/* TEST 2 : réservation puis consommation */
await rpc('reserve_order_stock',{
  p_order_ref:refConsume,
  p_items:[{
    product_id:product.id,
    quantity:1
  }],
  p_expires_at:new Date(Date.now()+30*60*1000).toISOString()
});

console.log('OK - seconde réservation créée.');

await rpc('consume_order_stock',{
  p_order_ref:refConsume
});

const {data:after,error:afterError}=await supabase
  .from('products')
  .select('stock')
  .eq('id',product.id)
  .single();

if(afterError)throw afterError;

if(Number(after.stock)!==initial-1){
  fail(`Stock incorrect après consommation : ${after.stock}`);
}

console.log(`OK - consommation : ${initial} → ${after.stock}.`);


/* restauration */
const {error:restoreError}=await supabase
  .from('products')
  .update({stock:initial})
  .eq('id',product.id);

if(restoreError)throw restoreError;

await supabase.from('stock_reservations')
  .delete()
  .in('order_ref',[refRelease,refConsume]);

await supabase.from('stock_events')
  .delete()
  .eq('order_ref',refConsume);

const {data:final,error:finalError}=await supabase
  .from('products')
  .select('stock')
  .eq('id',product.id)
  .single();

if(finalError)throw finalError;
if(Number(final.stock)!==initial)fail('Échec restauration stock.');

console.log(`OK - stock restauré à ${final.stock}.`);
console.log('OK - données de test nettoyées.');
console.log('TEST STOCK COMPLET RÉUSSI.');
