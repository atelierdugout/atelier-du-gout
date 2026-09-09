
const state={cart:JSON.parse(localStorage.getItem('adg-cart')||'{}'),products:[],mode:'pickup',gift:null,loyalty:null};
const euro=n=>new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR'}).format(n);
async function loadProducts(){
  state.products=await fetch('/assets/products.json').then(r=>r.json());
  updateCartCount();
}
function byId(id){return state.products.find(p=>p.id===id)}
function add(id){
  const p=byId(id); if(!p||p.disabled)return;
  state.cart[id]=(state.cart[id]||0)+1; save(); toast('Ajouté au panier');
}
function change(id,d){state.cart[id]=Math.max(0,(state.cart[id]||0)+d);if(!state.cart[id])delete state.cart[id];save();renderCart();}
function save(){localStorage.setItem('adg-cart',JSON.stringify(state.cart));updateCartCount()}
function count(){return Object.values(state.cart).reduce((a,b)=>a+b,0)}
function subtotal(){return Object.entries(state.cart).reduce((s,[id,q])=>s+(byId(id)?.price||0)*q,0)}
function updateCartCount(){const el=document.querySelector('#cart-count');if(el)el.textContent=count()}
function hasAlcohol(){return Object.keys(state.cart).some(id=>byId(id)?.alcohol)}
function openCart(){document.querySelector('#drawer').classList.add('open');renderCart()}
function closeCart(){document.querySelector('#drawer').classList.remove('open')}
function setMode(m){state.mode=m;renderCart()}
function toast(t){let e=document.querySelector('#toast');e.textContent=t;e.style.display='block';clearTimeout(window._tt);window._tt=setTimeout(()=>e.style.display='none',1600)}
function serviceSlots(dateStr,mode){
  if(!dateStr)return [];
  const d=new Date(dateStr+'T12:00:00'); const day=d.getDay();
  // Mon closed. Tue evening. Wed-Fri lunch+evening. Sat evening. Sun lunch only.
  if(day===1)return [];
  if(mode==='pickup'){
    if(day===2||day===6)return ['18h00–21h00'];
    if(day===3||day===4||day===5)return ['10h30–14h00','18h00–21h00'];
    if(day===0)return ['10h30–14h00'];
  } else {
    if(day===2||day===6)return ['18h00–19h00'];
    if(day===3||day===4||day===5)return ['11h30–12h30','18h00–19h00'];
    if(day===0)return ['11h30–12h30'];
  }
  return [];
}
function firstAvailable(){
  const now=new Date(); let d=new Date(now);
  d.setHours(12,0,0,0); d.setDate(d.getDate()+(now.getHours()>=20?2:1));
  for(let i=0;i<14;i++){const s=d.toISOString().slice(0,10);if(serviceSlots(s,state.mode).length)return s;d.setDate(d.getDate()+1)}
  return '';
}
function updateSlots(){
  const date=document.querySelector('#order-date');const slot=document.querySelector('#slot');if(!date||!slot)return;
  const slots=serviceSlots(date.value,state.mode);slot.innerHTML=slots.map(s=>`<option>${s}</option>`).join('');
  const note=document.querySelector('#date-note');if(note)note.textContent=slots.length?'':'Pas de retrait/livraison ce jour-là.';
}
function deliveryFee(){
  if(state.mode!=='delivery')return 0;
  const z=document.querySelector('#zone');return Number(z?.value||0);
}
function renderCart(){
  const lines=document.querySelector('#cart-lines');if(!lines)return;
  if(!state.products.length)return;
  const entries=Object.entries(state.cart);
  lines.innerHTML=entries.length?entries.map(([id,q])=>{const p=byId(id);return `<div class="cartline"><div><b>${p.name}</b><div class="small">${euro(p.price)} l'unité</div><div class="qrow"><button onclick="change('${id}',-1)">−</button><b>${q}</b><button onclick="change('${id}',1)">+</button></div></div><b>${euro(p.price*q)}</b></div>`}).join(''):'<p>Votre panier est vide.</p>';
  document.querySelector('#pickup').classList.toggle('active',state.mode==='pickup');
  document.querySelector('#delivery').classList.toggle('active',state.mode==='delivery');
  document.querySelector('#delivery-fields').style.display=state.mode==='delivery'?'block':'none';
  document.querySelector('#address-field').style.display=state.mode==='delivery'?'block':'none';
  const d=document.querySelector('#order-date');if(d&&!d.value)d.value=firstAvailable();
  if(d)d.min=new Date().toISOString().slice(0,10);
  updateSlots();
  const fee=deliveryFee();document.querySelector('#sub-total').textContent=euro(subtotal());
  document.querySelector('#delivery-fee').textContent=euro(fee);
  const gross=subtotal()+fee; const loyalty=Math.min(gross,Number(state.loyalty?.value||0)); const afterLoyalty=Math.max(0,gross-loyalty); const gift=Math.min(afterLoyalty,Number(state.gift?.balance_cents||0)/100);
  const lr=document.querySelector('#loyalty-discount-row');if(lr)lr.style.display=loyalty>0?'flex':'none';const lv=document.querySelector('#loyalty-discount');if(lv)lv.textContent='− '+euro(loyalty);
  const gl=document.querySelector('#gift-discount-row'); if(gl)gl.style.display=gift>0?'flex':'none'; const gv=document.querySelector('#gift-discount');if(gv)gv.textContent='− '+euro(gift);
  document.querySelector('#grand-total').textContent=euro(Math.max(0,gross-loyalty-gift));
  document.querySelector('#alcohol-box').style.display=hasAlcohol()?'block':'none';
  document.querySelector('#checkout-btn').disabled=!entries.length;
}
function changeZone(){renderCart()}
async function validateOrder(){
  if(state.mode==='delivery'&&subtotal()<20){toast('Minimum livraison : 20 €');return}
  const req=['name','phone','email','order-date','slot'];
  if(state.mode==='delivery')req.push('address');
  for(const id of req){const e=document.querySelector('#'+id);if(!e||!e.value.trim()){toast('Merci de compléter les informations');e?.focus();return}}
  if(hasAlcohol()&&!document.querySelector('#age18').checked){toast('Confirmation 18+ nécessaire');return}
  if(!document.querySelector('#cgv').checked){toast('Merci d’accepter les CGV');return}
  const order={
    items:Object.entries(state.cart).map(([id,q])=>({id,name:byId(id).name,qty:q,unit_price:byId(id).price})),
    subtotal:subtotal(),delivery_fee:deliveryFee(),total:subtotal()+deliveryFee(),
    mode:state.mode,zone:document.querySelector('#zone')?.value||null,
    date:document.querySelector('#order-date').value,slot:document.querySelector('#slot').value,
    customer:{name:document.querySelector('#name').value,phone:document.querySelector('#phone').value,email:document.querySelector('#email').value,address:document.querySelector('#address')?.value||''},
    comments:document.querySelector('#comments').value,
    allergies:document.querySelector('#allergies').value,
    gift_code:state.gift?.code||null,
    loyalty_reward_points:state.loyalty?.points||0,
    loyalty_token:state.loyalty?localStorage.getItem('adg-loyalty-token'):null
  };
  localStorage.setItem('adg-pending-order',JSON.stringify(order));
  const info=document.querySelector('#payment-info');
  if(info) info.innerHTML='<div class="warning"><b>Connexion au paiement sécurisé…</b></div>';
  try{
    await createMolliePaymentFromOrder(order);
  }catch(e){
    console.error(e);
    if(info) info.innerHTML='<div class="warning"><b>Le paiement n’a pas pu être lancé.</b><br>'+String(e.message||e)+'</div>';
    toast('Erreur de paiement');
  }
}
function renderProducts(category){
  const grid=document.querySelector('#product-grid');if(!grid)return;
  const sub=location.hash.slice(1);
  const ps=state.products.filter(p=>p.cat===category);
  const groups=[...new Set(ps.map(p=>p.sub))];
  const buttons=document.querySelector('#filters');
  if(buttons){
    buttons.innerHTML = '<button class="filter active" data-sub="">Tout</button>' +
      groups.map(g => `<button class="filter" data-sub="${g}">${g}</button>`).join('');
    buttons.querySelectorAll('.filter').forEach(btn => {
      btn.addEventListener('click', () => filterSub(btn, btn.dataset.sub || ''));
    });
  }
  grid.innerHTML=ps.map(p=>card(p)).join('');
  if(sub){const target=[...document.querySelectorAll('.filter')].find(b=>b.dataset.sub===decodeURIComponent(sub));if(target)filterSub(target,target.dataset.sub)}
}
function card(p){
  const img=p.image?`style="background-image:url('/assets/images/${p.image}')"`:'';
  const allerg=(p.allergens&&p.allergens.length)?`<div class="meta"><b>Allergènes :</b> ${p.allergens.join(', ')}</div>`:'';
  return `<article class="product" data-sub="${p.sub}"><div class="photo" ${img}>${p.image?'':'Photo à venir'}</div><div class="content"><div><span class="badge ${p.disabled?'soon':''}">${p.badge||'Disponible'}</span></div><div class="eyebrow">${p.sub}</div><h3>${p.name}</h3><div class="desc">${p.desc||''}</div>${allerg}<div class="foot"><span class="price">${euro(p.price)}</span><button class="add" ${p.disabled?'disabled':''} onclick="add('${p.id}')">${p.disabled?'BIENTÔT':'AJOUTER'}</button></div></div></article>`
}
function filterSub(btn,sub){document.querySelectorAll('.filter').forEach(b=>b.classList.remove('active'));btn.classList.add('active');document.querySelectorAll('.product').forEach(p=>p.style.display=(!sub||p.dataset.sub===sub)?'flex':'none')}
document.addEventListener('DOMContentLoaded',async()=>{await loadProducts();const cat=document.body.dataset.category;if(cat)renderProducts(cat);renderCart()});

function productMini(p){
 const img=p.image?`style="background-image:url('/assets/images/${p.image}')"`:'';
 return `<div class="mini-card"><div class="mini-photo" ${img}></div><div class="mini-content"><div class="tag">${p.cat}</div><h3>${p.name}</h3><div class="desc">${p.desc||''}</div><div class="foot"><span class="price">${euro(p.price)}</span><button class="add" ${p.disabled?'disabled':''} onclick="add('${p.id}')">+</button></div></div></div>`;
}
function renderHome(){
 const best=document.querySelector('#best-grid'),today=document.querySelector('#today-list');
 if(best)best.innerHTML=state.products.filter(p=>p.bestSeller&&!p.disabled).slice(0,8).map(productMini).join('');
 if(today)today.innerHTML=state.products.filter(p=>p.today&&!p.disabled).slice(0,6).map(p=>`<div class="today-item"><div><b>${p.name}</b><div class="hint">${p.desc||''}</div></div><div><strong>${euro(p.price)}</strong> <button class="add" onclick="add('${p.id}')">+</button></div></div>`).join('');
}
function searchProducts(q){
 q=(q||'').toLowerCase().trim();
 document.querySelectorAll('.product').forEach(card=>{
   const p=byId(card.dataset.id);
   card.style.display=(!q||((p?.keywords||'').includes(q)))?'flex':'none';
 });
}
function loyaltyPreview(){const el=document.querySelector('#points-earned');if(el){const eligible=Math.max(0,subtotal()+deliveryFee()-Number(state.loyalty?.value||0));el.textContent='+'+Math.floor(eligible)+' points';}}
const _oldCard=card;card=function(p){return _oldCard(p).replace('<article class="product"',`<article class="product" data-id="${p.id}"`)};
const _oldRenderCart=renderCart;renderCart=function(){_oldRenderCart();loyaltyPreview();const u=document.querySelector('#upsell');if(u&&state.products.length){const suggestions=state.products.filter(p=>['tiramisu','panna','gassosa','mandarinata'].includes(p.id)&&!state.cart[p.id]);u.innerHTML=suggestions.slice(0,2).map(p=>`<button class="choice" onclick="add('${p.id}');renderCart()">+ ${p.name} · ${euro(p.price)}</button>`).join('')}}
document.addEventListener('DOMContentLoaded',()=>setTimeout(renderHome,100));


async function createMolliePaymentFromOrder(order) {
  const response = await fetch("/.netlify/functions/create-payment", {
    method: "POST",
    headers: {"content-type":"application/json"},
    body: JSON.stringify({order})
  });
  const data = await response.json();
  if (!response.ok || (!data.checkoutUrl && !data.redirectUrl)) throw new Error(data.error || "Impossible de lancer le paiement.");
  window.location.href = data.checkoutUrl || data.redirectUrl;
}

async function applyGiftCode(){
  const input=document.querySelector('#gift-code');
  const msg=document.querySelector('#gift-message');
  const btn=document.querySelector('#gift-apply-btn');
  const code=String(input?.value||'').trim().toUpperCase();
  if(!code){state.gift=null;if(msg)msg.textContent='Saisissez votre code cadeau.';renderCart();return;}
  if(btn){btn.disabled=true;btn.textContent='Vérification…';}
  if(msg)msg.textContent='Vérification de la carte cadeau…';
  try{
    const r=await fetch('/.netlify/functions/gift-balance',{method:'POST',headers:{'content-type':'application/json'},cache:'no-store',body:JSON.stringify({code})});
    let d={}; try{d=await r.json();}catch{}
    if(!r.ok||!d.valid)throw Error(d.error||'Carte cadeau invalide.');
    state.gift={code,balance_cents:Number(d.balance_cents||0)};
    renderCart();
    const fresh=document.querySelector('#gift-message');
    if(fresh)fresh.textContent='Carte cadeau appliquée · solde disponible '+euro(state.gift.balance_cents/100);
    const freshInput=document.querySelector('#gift-code');if(freshInput)freshInput.value=code;
  }catch(e){
    state.gift=null;renderCart();
    const fresh=document.querySelector('#gift-message');if(fresh)fresh.textContent='Erreur : '+String(e.message||e);
    const freshInput=document.querySelector('#gift-code');if(freshInput)freshInput.value=code;
  }finally{
    const freshBtn=document.querySelector('#gift-apply-btn');if(freshBtn){freshBtn.disabled=false;freshBtn.textContent='Appliquer';}
  }
}
function removeGiftCode(){state.gift=null;const i=document.querySelector('#gift-code');if(i)i.value='';renderCart();const m=document.querySelector('#gift-message');if(m)m.textContent='Carte cadeau retirée.';}
window.applyGiftCode=applyGiftCode;window.removeGiftCode=removeGiftCode;



async function loadLoyaltyRewards(){
 const box=document.querySelector('#loyalty-reward-box'),msg=document.querySelector('#loyalty-message'),sel=document.querySelector('#loyalty-reward');if(!box||!sel)return;
 const token=localStorage.getItem('adg-loyalty-token');
 if(!token){box.style.display='block';sel.innerHTML='<option value="">Connectez-vous à votre compte fidélité</option>';if(msg)msg.innerHTML='<a href="/compte.html">Se connecter à mon compte fidélité →</a>';return;}
 try{const r=await fetch('/.netlify/functions/loyalty-account',{method:'POST',headers:{'content-type':'application/json'},cache:'no-store',body:JSON.stringify({token})});const d=await r.json();if(!r.ok)throw Error(d.error||'Session expirée.');const pts=Number(d.account?.points||0);const available=(d.rewards||[]).filter(x=>pts>=Number(x.points));box.style.display='block';sel.innerHTML='<option value="">Ne pas utiliser de récompense</option>'+available.map(x=>`<option value="${x.points}" data-value="${x.value}">${x.points} points → ${euro(x.value)}</option>`).join('');if(msg)msg.textContent=available.length?`Solde fidélité : ${pts} points.`:`Solde fidélité : ${pts} points · aucune récompense disponible.`;}catch(e){localStorage.removeItem('adg-loyalty-token');state.loyalty=null;sel.innerHTML='<option value="">Reconnectez-vous à votre compte fidélité</option>';if(msg)msg.innerHTML='<a href="/compte.html">Session expirée — se reconnecter →</a>';}}
function applyLoyaltyReward(){const sel=document.querySelector('#loyalty-reward'),msg=document.querySelector('#loyalty-message');const opt=sel?.selectedOptions?.[0];const points=Number(sel?.value||0),value=Number(opt?.dataset?.value||0);if(!points){state.loyalty=null;renderCart();if(msg)msg.textContent='Récompense retirée.';return;}const gross=subtotal()+deliveryFee();if(gross<value){state.loyalty=null;renderCart();if(msg)msg.textContent=`Cette récompense nécessite une commande d’au moins ${euro(value)}.`;return;}state.loyalty={points,value};renderCart();const fresh=document.querySelector('#loyalty-message');if(fresh)fresh.textContent=`Récompense appliquée : −${euro(value)} (${points} points).`;}
window.applyLoyaltyReward=applyLoyaltyReward;
document.addEventListener('DOMContentLoaded',()=>setTimeout(loadLoyaltyRewards,150));
