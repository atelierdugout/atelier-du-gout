
const state={cart:JSON.parse(localStorage.getItem('adg-cart')||'{}'),products:[],mode:'pickup',gift:null,loyalty:null};
const euro=n=>new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR'}).format(n);
async function loadProducts(){
  try {
    const response = await fetch('/.netlify/functions/products', {
      cache: 'no-store'
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data?.error || 'Impossible de charger les produits.');
    }

    if (!Array.isArray(data)) {
      throw new Error('Réponse produits invalide.');
    }

    state.products = data;
  } catch (error) {
    console.error('Produits boutique :', error);
    state.products = [];
    toast('Impossible de charger les produits pour le moment.');
  }
}
function escapeHtml(value){
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function safeImageUrl(value){
  const raw = String(value ?? '').trim();
  if (!raw) return '';

  try {
    const url = new URL(raw, window.location.origin);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    return url.href;
  } catch {
    return '';
  }
}

function safeId(value){
  return String(value ?? '').replace(/[^A-Za-z0-9_-]/g, '');
}

function byId(id){return state.products.find(p=>p.id===id)}
function add(id){
  const p=byId(id);if(!p||p.disabled||p.stock===0)return;
  const current=state.cart[id]||0;
  if(p.stock!==null&&p.stock!==undefined&&current>=Number(p.stock)){toast('Stock maximum atteint');return}
  state.cart[id]=current+1;save();renderCart();toast('Ajouté au panier');
}
function change(id,d){
  const p=byId(id);if(!p)return;
  let q=Math.max(0,(state.cart[id]||0)+d);
  if(p.stock!==null&&p.stock!==undefined)q=Math.min(q,Number(p.stock));
  if(q)state.cart[id]=q;else delete state.cart[id];
  save();renderCart();
}
function save(){localStorage.setItem('adg-cart',JSON.stringify(state.cart));updateCartCount()}
function count(){return Object.values(state.cart).reduce((a,b)=>a+b,0)}function subtotal(){return Object.entries(state.cart).reduce((s,[id,q])=>s+(byId(id)?.price||0)*q,0)}
function updateCartCount(){const el=document.querySelector('#cart-count');if(el)el.textContent=count()}
function hasAlcohol(){return Object.keys(state.cart).some(id=>byId(id)?.alcohol)}
let cartReturnFocus = null;

function openCart(){
  const drawer = document.querySelector('#drawer');
  if(!drawer) return;

  cartReturnFocus = document.activeElement;
  drawer.classList.add('open');
  document.body.style.overflow = 'hidden';

  renderCart();

  requestAnimationFrame(() => {
    const closeButton = drawer.querySelector('.close');
    if(closeButton) closeButton.focus();
  });
}

function closeCart(){
  const drawer = document.querySelector('#drawer');
  if(!drawer) return;

  drawer.classList.remove('open');
  document.body.style.overflow = '';

  if(cartReturnFocus && typeof cartReturnFocus.focus === 'function'){
    cartReturnFocus.focus();
  }

  cartReturnFocus = null;
}

document.addEventListener('keydown', event => {
  if(event.key === 'Escape'){
    const drawer = document.querySelector('#drawer');
    if(drawer?.classList.contains('open')){
      closeCart();
    }
  }
});
function setMode(m){state.mode=m;renderCart()}
function toast(t){let e=document.querySelector('#toast');e.textContent=t;e.style.display='block';clearTimeout(window._tt);window._tt=setTimeout(()=>e.style.display='none',1600)}
const defaultOrderSettings={
  pickup_enabled:true,
  delivery_enabled:true,
  weekly:{
    "0":{pickup:["10h30–14h00"],delivery:["11h30–12h30"]},
    "1":{pickup:[],delivery:[]},
    "2":{pickup:["18h00–21h00"],delivery:["18h00–19h00"]},
    "3":{pickup:["10h30–14h00","18h00–21h00"],delivery:["11h30–12h30","18h00–19h00"]},
    "4":{pickup:["10h30–14h00","18h00–21h00"],delivery:["11h30–12h30","18h00–19h00"]},
    "5":{pickup:["10h30–14h00","18h00–21h00"],delivery:["11h30–12h30","18h00–19h00"]},
    "6":{pickup:["18h00–21h00"],delivery:["18h00–19h00"]}
  },
  closed_dates:[],
  delivery_minimum:20,
  delivery_zones:[
    {key:'aulnay',label:'Aulnay-de-Saintonge',fee:3.5},
    {key:'10km',label:'Jusqu’à 10 km',fee:5},
    {key:'10-15km',label:'10 à 15 km',fee:7.5}
  ]
};

state.orderSettings=defaultOrderSettings;
state.fullOrderSlots=[];

async function loadOrderSettings(){
  try{
    const r=await fetch('/.netlify/functions/order-settings',{cache:'no-store'});
    if(!r.ok)throw new Error('HTTP '+r.status);
    const data=await r.json();
    const x=data?.settings||{};

    state.orderSettings={
      ...defaultOrderSettings,
      ...x,
      weekly:{
        ...defaultOrderSettings.weekly,
        ...(x.weekly||{})
      },
      closed_dates:Array.isArray(x.closed_dates)?x.closed_dates:[]
    };

    state.fullOrderSlots=Array.isArray(data?.full_slots)
      ? data.full_slots
      : [];

    if(state.mode==='pickup' &&
       state.orderSettings.pickup_enabled===false &&
       state.orderSettings.delivery_enabled!==false){
      state.mode='delivery';
    }

    if(state.mode==='delivery' &&
       state.orderSettings.delivery_enabled===false &&
       state.orderSettings.pickup_enabled!==false){
      state.mode='pickup';
    }
  }catch(e){
    console.error('Créneaux boutique :',e);
    state.orderSettings=defaultOrderSettings;
    state.fullOrderSlots=[];
  }

  const d=document.querySelector('#order-date');
  if(d)d.value=firstAvailable();
  renderCart();
}

function serviceSlots(dateStr,mode){
  if(!dateStr)return [];

  const settings=state.orderSettings||defaultOrderSettings;

  if(mode==='pickup'&&settings.pickup_enabled===false)return [];
  if(mode==='delivery'&&settings.delivery_enabled===false)return [];

  if(Array.isArray(settings.closed_dates)&&settings.closed_dates.includes(dateStr)){
    return [];
  }

  const d=new Date(dateStr+'T12:00:00');
  const day=String(d.getDay());
  const slots=settings.weekly?.[day]?.[mode];

  if(!Array.isArray(slots))return [];

  const full=Array.isArray(state.fullOrderSlots)
    ? state.fullOrderSlots
    : [];

  return slots.filter(slot=>!full.some(x=>
    String(x.date)===dateStr &&
    String(x.slot)===slot &&
    String(x.mode)===mode
  ));
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

  const selected=String(document.querySelector('#zone')?.value||'');
  const zones=state.orderSettings?.delivery_zones||defaultOrderSettings.delivery_zones;

  const zone=zones.find(z=>
    String(z.key)===selected ||
    String(z.fee)===selected
  );

  return Number(zone?.fee||0);
}
function renderCart(){
  const lines=document.querySelector('#cart-lines');if(!lines)return;
  if(!state.products.length)return;
  const staleIds=Object.keys(state.cart).filter(id=>!byId(id));
  if(staleIds.length){staleIds.forEach(id=>delete state.cart[id]);save();}
  for(const [id,q] of Object.entries(state.cart)){
    const p=byId(id);
    if(p&&p.stock!==null&&p.stock!==undefined&&q>Number(p.stock)){
      if(Number(p.stock)>0)state.cart[id]=Number(p.stock);
      else delete state.cart[id];
      save();
    }
  }
  const entries=Object.entries(state.cart);
  lines.innerHTML=entries.length?entries.map(([id,q])=>{
    const p=byId(id);
    const safeProductId=safeId(id);
    return `<div class="cartline">
      <div>
        <b>${escapeHtml(p.name || '')}</b>
        <div class="small">${euro(Number(p.price))} l'unité</div>
        <div class="qrow">
          <button onclick="change('${safeProductId}',-1)" aria-label="Retirer une unité">−</button>
          <b>${Number(q)}</b>
          <button onclick="change('${safeProductId}',1)" aria-label="Ajouter une unité">+</button>
        </div>
      </div>
      <b>${euro(Number(p.price)*Number(q))}</b>
    </div>`;
  }).join(''):'<p>Votre panier est vide.</p>';  document.querySelector('#pickup').classList.toggle('active',state.mode==='pickup');
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
  const selectedDate=document.querySelector('#order-date')?.value||'';
  const selectedSlot=document.querySelector('#slot')?.value||'';
  const allowedSlots=serviceSlots(selectedDate,state.mode);

  if(!selectedDate||!selectedSlot||!allowedSlots.includes(selectedSlot)){
    toast('Ce créneau n’est plus disponible');
    const d=document.querySelector('#order-date');
    if(d)d.value=firstAvailable();
    updateSlots();
    return;
  }

  if(state.mode==='delivery'){
    const minimum=Number(
      state.orderSettings?.delivery_minimum ??
      defaultOrderSettings.delivery_minimum
    );

    if(subtotal()<minimum){
      toast(`Minimum livraison : ${euro(minimum)}`);
      return;
    }
  }
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
    loyalty_token:null,
    age18_confirmed:hasAlcohol() ? document.querySelector('#age18').checked === true : false,
    cgv_accepted:document.querySelector('#cgv').checked === true,
    cgv_version:'2026-10-07'
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
function renderProducts(category) {

  const grid = document.querySelector("#product-grid");
  if (!grid) return;

  const ps = state.products.filter(p => p.active && p.category === category);

  const buttons = document.querySelector("#filters");

  if (buttons) {
    const subs = [...new Set(ps.map(p => p.subcategory).filter(Boolean))];
    buttons.innerHTML =
      `<button class="filter active" data-filter="">Tout</button>` +
      subs.map(sub =>
        `<button class="filter" data-filter="${escapeHtml(sub)}">${escapeHtml(sub)}</button>`
      ).join("");

    buttons.querySelectorAll(".filter").forEach(button => {
      button.addEventListener("click", () => {
        filterSub(button, button.dataset.filter || "");
      });
    });
  }
grid.innerHTML = ps.map(card).join("");
  
}


function card(p) {
  const image = safeImageUrl(p.image);
  const id = safeId(p.id);

  const img = image
    ? `style="background-image:url('${encodeURI(image)}')"`
    : "";

  return `
    <article class="product"
      data-id="${escapeHtml(id)}"
      data-sub="${escapeHtml(p.subcategory || '')}">
      <div class="photo" ${img}>
        ${image ? "" : "Photo à venir"}
      </div>

      <div class="content">
        <div>
          <span class="badge">${p.stock===0 ? "Épuisé" : "Disponible"}</span>
        </div>

        <div class="eyebrow">${escapeHtml(p.category || '')}</div>
        <h3>${escapeHtml(p.name || '')}</h3>

        <div class="desc">
          ${escapeHtml(p.description || '')}
        </div>

        <div class="foot">
          <span class="price">${euro(Number(p.price))}</span>
          <button class="add"
            ${p.stock===0 ? "disabled" : ""}
            onclick="add('${id}')">${p.stock===0 ? "ÉPUISÉ" : "AJOUTER"}</button>
        </div>
      </div>
    </article>
  `;
}
function filterSub(btn,sub){document.querySelectorAll('.filter').forEach(b=>b.classList.remove('active'));btn.classList.add('active');document.querySelectorAll('.product').forEach(p=>p.style.display=(!sub||p.dataset.sub===sub)?'flex':'none')}
document.addEventListener('DOMContentLoaded',async()=>{await loadProducts();const cat=document.body.dataset.category;if(cat)renderProducts(cat);renderCart()});

function productMini(p){
  const image = safeImageUrl(p.image);
  const id = safeId(p.id);
  const img = image ? `style="background-image:url('${encodeURI(image)}')"` : '';

  return `<div class="mini-card">
    <div class="mini-photo" ${img}></div>
    <div class="mini-content">
      <div class="tag">${escapeHtml(p.category || '')}</div>
      <h3>${escapeHtml(p.name || '')}</h3>
      <div class="desc">${escapeHtml(p.description || '')}</div>
      <div class="foot">
        <span class="price">${euro(Number(p.price))}</span>
        <button class="add"
          ${p.disabled||p.stock===0?'disabled':''}
          onclick="add('${id}')">${p.stock===0?'Épuisé':'+'}</button>
      </div>
    </div>
  </div>`;
}
function renderHome(){
 const best=document.querySelector('#best-grid'),today=document.querySelector('#today-list');
 if(best)best.innerHTML=state.products.filter(p=>p.featured&&!p.disabled).slice(0,8).map(productMini).join('');
 if(today)today.innerHTML=state.products
   .filter(p=>p.today&&!p.disabled)
   .slice(0,6)
   .map(p=>{
     const id=safeId(p.id);
     return `<div class="today-item">
       <div>
         <b>${escapeHtml(p.name || '')}</b>
         <div class="hint">${escapeHtml(p.description || '')}</div>
       </div>
       <div>
         <strong>${euro(Number(p.price))}</strong>
         <button class="add"
           ${p.stock===0?'disabled':''}
           onclick="add('${id}')">${p.stock===0?'Épuisé':'+'}</button>
       </div>
     </div>`;
   }).join('');
}
function searchProducts(q){
 q=(q||'').toLowerCase().trim();
 document.querySelectorAll('.product').forEach(card=>{
   const p=byId(card.dataset.id);
   card.style.display=(!q||((p?.keywords||'').includes(q)))?'flex':'none';
 });
}
function loyaltyPreview(){const el=document.querySelector('#points-earned');if(el){const eligible=Math.max(0,subtotal()+deliveryFee()-Number(state.loyalty?.value||0));el.textContent='+'+Math.floor(eligible)+' points';}}

const _oldRenderCart=renderCart;renderCart=function(){_oldRenderCart();loyaltyPreview();const u=document.querySelector('#upsell');if(u&&state.products.length){const suggestions=state.products.filter(p=>['tiramisu','panna','gassosa','mandarinata'].includes(p.id)&&!state.cart[p.id]&&p.stock!==0);u.innerHTML=suggestions.slice(0,2).map(p=>`<button class="choice" onclick="add('${safeId(p.id)}');renderCart()">+ ${escapeHtml(p.name || '')} · ${euro(Number(p.price))}</button>`).join('')}}
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
 const legacyToken=localStorage.getItem('adg-loyalty-token');
 if(!token){box.style.display='block';sel.innerHTML='<option value="">Connectez-vous à votre compte fidélité</option>';if(msg)msg.innerHTML='<a href="/compte.html">Se connecter à mon compte fidélité →</a>';return;}
 try{const r=await fetch('/.netlify/functions/loyalty-account',{method:'POST',headers:{'content-type':'application/json'},cache:'no-store',body:JSON.stringify({token:legacyToken||''})});const d=await r.json();if(!r.ok)throw Error(d.error||'Session expirée.');localStorage.removeItem('adg-loyalty-token');const pts=Number(d.account?.points||0);const available=(d.rewards||[]).filter(x=>pts>=Number(x.points));box.style.display='block';sel.innerHTML='<option value="">Ne pas utiliser de récompense</option>'+available.map(x=>`<option value="${x.points}" data-value="${x.value}">${x.points} points → ${euro(x.value)}</option>`).join('');if(msg)msg.textContent=available.length?`Solde fidélité : ${pts} points.`:`Solde fidélité : ${pts} points · aucune récompense disponible.`;}catch(e){localStorage.removeItem('adg-loyalty-token');state.loyalty=null;sel.innerHTML='<option value="">Reconnectez-vous à votre compte fidélité</option>';if(msg)msg.innerHTML='<a href="/compte.html">Session expirée — se reconnecter →</a>';}}
function applyLoyaltyReward(){const sel=document.querySelector('#loyalty-reward'),msg=document.querySelector('#loyalty-message');const opt=sel?.selectedOptions?.[0];const points=Number(sel?.value||0),value=Number(opt?.dataset?.value||0);if(!points){state.loyalty=null;renderCart();if(msg)msg.textContent='Récompense retirée.';return;}const gross=subtotal()+deliveryFee();if(gross<value){state.loyalty=null;renderCart();if(msg)msg.textContent=`Cette récompense nécessite une commande d’au moins ${euro(value)}.`;return;}state.loyalty={points,value};renderCart();const fresh=document.querySelector('#loyalty-message');if(fresh)fresh.textContent=`Récompense appliquée : −${euro(value)} (${points} points).`;}
window.applyLoyaltyReward=applyLoyaltyReward;
document.addEventListener('DOMContentLoaded',()=>setTimeout(loadLoyaltyRewards,150));


/* === Apparence dynamique de la boutique === */
async function loadSiteAppearance() {
  try {
    const response = await fetch("/.netlify/functions/site-settings", {
      cache: "no-store"
    });

    if (!response.ok) return;

    const data = await response.json();
    const settings = data?.settings || {};

    const promo = settings.promo || {};
    const hero = settings.hero || {};
    const sections = settings.sections || {};

    const promoEl = document.getElementById("site-promo");
    if (promoEl) {
      if (typeof promo.text === "string" && promo.text.trim()) {
        promoEl.textContent = promo.text;
      }

      if (promo.visible === false) {
        promoEl.hidden = true;
      }
    }

    const kickerEl = document.getElementById("site-hero-kicker");
    const titleEl = document.getElementById("site-hero-title");
    const textEl = document.getElementById("site-hero-text");
    const buttonEl = document.getElementById("site-hero-button");
    const heroEl = document.getElementById("site-hero");

    if (kickerEl && typeof hero.kicker === "string" && hero.kicker.trim()) {
      kickerEl.textContent = hero.kicker;
    }

    if (titleEl && typeof hero.title === "string" && hero.title.trim()) {
      titleEl.textContent = hero.title;
    }

    if (textEl && typeof hero.text === "string" && hero.text.trim()) {
      textEl.textContent = hero.text;
    }

    if (buttonEl && typeof hero.button === "string" && hero.button.trim()) {
      buttonEl.textContent = hero.button;
    }

    if (heroEl && typeof hero.image === "string" && hero.image.trim()) {
      heroEl.style.backgroundImage =
        `linear-gradient(rgba(0,0,0,.28), rgba(0,0,0,.28)), url("${hero.image}")`;
      heroEl.style.backgroundSize = "cover";
      heroEl.style.backgroundPosition = "center";
    }


    const content = settings.content || {};

    function setSectionText(sectionId, selector, value) {
      if (typeof value !== "string" || !value.trim()) return;

      const section = document.getElementById(sectionId);
      const element = section?.querySelector(selector);

      if (element) element.textContent = value.trim();
    }

    function applySectionContent() {
      const univers = content.univers || {};
      setSectionText("univers", ".sectionhead .kicker", univers.kicker);
      setSectionText("univers", ".sectionhead h2", univers.title);

      const today = content.today || {};
      setSectionText("today", ".sectionhead .kicker", today.kicker);
      setSectionText("today", ".sectionhead h2", today.title);
      setSectionText("today", ".sectionhead p", today.text);

      const best = content.best || {};
      setSectionText("best", ".sectionhead .kicker", best.kicker);
      setSectionText("best", ".sectionhead h2", best.title);
      setSectionText("best", ".sectionhead p", best.text);

      const story = content.story || {};
      setSectionText("story", ".story-copy .kicker", story.kicker);
      setSectionText("story", ".story-copy h2", story.title);
      setSectionText("story", ".story-copy p", story.text);
      setSectionText("story", ".story-copy .cta", story.button);

      const storySection = document.getElementById("story");
      const storyPhoto = storySection?.querySelector(".story-photo");

      if (
        storyPhoto &&
        typeof story.image === "string" &&
        story.image.trim()
      ) {
        storyPhoto.style.backgroundImage = `url("${story.image.trim()}")`;
        storyPhoto.style.backgroundSize = "cover";
        storyPhoto.style.backgroundPosition = "center";
      }

      const gift = content.gift || {};
      setSectionText("gift", ".kicker", gift.kicker);
      setSectionText("gift", "h2", gift.title);
      setSectionText("gift", "p", gift.text);
      setSectionText("gift", ".cta", gift.button);

      const loyalty = content.loyalty || {};
      setSectionText("loyalty", ".kicker", loyalty.kicker);
      setSectionText("loyalty", "h2", loyalty.title);
      setSectionText("loyalty", "p", loyalty.text);
      setSectionText("loyalty", "a b", loyalty.button);
    }

    applySectionContent();

    function applyUniverseTiles() {
      const tiles = settings.universeTiles || {};
      const style = settings.universeStyle || {};

      const grid = document.querySelector("#univers .universe-grid");

      if (grid) {
        grid.classList.remove(
          "universe-layout-2",
          "universe-layout-3",
          "universe-layout-large"
        );

        const layout =
          style.layout === "2" || style.layout === "large"
            ? style.layout
            : "3";

        grid.classList.add("universe-layout-" + layout);
      }

      const height =
        ["compact", "normal", "large"].includes(style.height)
          ? style.height
          : "normal";

      const radius =
        ["none", "small", "normal", "large"].includes(style.radius)
          ? style.radius
          : "normal";

      const overlay =
        ["light", "normal", "dark"].includes(style.overlay)
          ? style.overlay
          : "normal";

      const position =
        ["center", "top", "bottom"].includes(style.position)
          ? style.position
          : "center";

      const overlayValues = {
        light: [".16", ".48"],
        normal: [".32", ".72"],
        dark: [".48", ".84"]
      };

      const [overlayTop, overlayBottom] = overlayValues[overlay];

      const tileMap = {
        food: ".universe-food",
        grocery: ".universe-grocery",
        drinks: ".universe-drinks",
        minargent: ".universe-minargent",
        gifts: ".universe-gifts",
        card: ".universe-card"
      };

      Object.entries(tileMap).forEach(([id, selector]) => {
        const tile = tiles[id] || {};
        const element = document.querySelector(selector);

        if (!element) return;

        element.classList.remove(
          "universe-height-compact",
          "universe-height-normal",
          "universe-height-large",
          "universe-radius-none",
          "universe-radius-small",
          "universe-radius-normal",
          "universe-radius-large"
        );

        element.classList.add(
          "universe-height-" + height,
          "universe-radius-" + radius
        );

        const kicker = element.querySelector("span");
        const title = element.querySelector("h3");
        const text = element.querySelector("p");
        const button = element.querySelector("b");

        if (typeof tile.kicker === "string" && tile.kicker.trim() && kicker) {
          kicker.textContent = tile.kicker.trim();
        }

        if (typeof tile.title === "string" && tile.title.trim() && title) {
          title.textContent = tile.title.trim();
        }

        if (typeof tile.text === "string" && tile.text.trim() && text) {
          text.textContent = tile.text.trim();
        }

        if (typeof tile.button === "string" && tile.button.trim() && button) {
          button.textContent = tile.button.trim();
        }

        if (typeof tile.image === "string" && tile.image.trim()) {
          element.classList.add("universe-with-image");
          element.style.backgroundImage =
            `linear-gradient(rgba(20,30,20,${overlayTop}), rgba(20,30,20,${overlayBottom})), url("${tile.image.trim()}")`;
          element.style.backgroundSize = "cover";
          element.style.backgroundPosition = position;
        }
      });
    }

    applyUniverseTiles();

    const sectionMap = {
      univers: "univers",
      today: "today",
      best: "best",
      story: "story",
      gift: "gift",
      loyalty: "loyalty"
    };

    const defaultOrder = [
      "univers",
      "today",
      "best",
      "story",
      "gift",
      "loyalty"
    ];

    const requestedOrder = Array.isArray(settings.order)
      ? settings.order.filter(id => defaultOrder.includes(id))
      : [];

    const finalOrder = [
      ...new Set([
        ...requestedOrder,
        ...defaultOrder
      ])
    ];

    const firstSection = document.getElementById("univers");
    const sectionParent = firstSection?.parentElement;

    if (sectionParent) {
      const reassurance = sectionParent.querySelector(".reassurance");

      finalOrder.forEach(id => {
        const element = document.getElementById(sectionMap[id]);
        if (!element) return;

        if (reassurance) {
          sectionParent.insertBefore(element, reassurance);
        } else {
          sectionParent.appendChild(element);
        }
      });
    }

    Object.entries(sectionMap).forEach(([key, id]) => {
      const element = document.getElementById(id);
      if (!element) return;

      if (sections[key] === false) {
        element.hidden = true;
      }
    });

  } catch (error) {
    console.error("Apparence boutique :", error);
  }
}

document.addEventListener("DOMContentLoaded", loadSiteAppearance);
document.addEventListener("DOMContentLoaded", loadOrderSettings);
