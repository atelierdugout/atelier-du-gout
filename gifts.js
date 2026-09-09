let giftValue=50,giftRecipient='other',giftSend='now';
const $=id=>document.getElementById(id);
const emailOk=s=>/^\S+@\S+\.\S+$/.test(String(s||''));

function refreshGift(){
  $('giftPreviewValue').textContent=giftValue+' €';
  $('giftSummaryValue').textContent=giftValue+' €';
  $('giftPayButton').textContent='Payer '+giftValue+' €';
}
function setRecipient(mode){
  giftRecipient=mode;
  $('giftForOther').classList.toggle('active',mode==='other');
  $('giftForMe').classList.toggle('active',mode==='me');
  $('giftRecipientFields').classList.toggle('hidden',mode==='me');
}
function setSend(mode){
  giftSend=mode;
  $('sendNow').classList.toggle('active',mode==='now');
  $('sendLater').classList.toggle('active',mode==='later');
  $('giftDateField').classList.toggle('hidden',mode!=='later');
  $('giftSummarySend').textContent=mode==='now'?'Dès le paiement':'À la date choisie';
}
function showError(msg){const el=$('giftError');el.textContent=msg;el.style.display='block';}
function clearError(){const el=$('giftError');el.textContent='';el.style.display='none';}

async function payGift(){
  clearError();
  const buyerName=$('buyerName').value.trim(),buyerEmail=$('buyerEmail').value.trim();
  const recipientName=giftRecipient==='me'?buyerName:$('giftName').value.trim();
  const recipientEmail=giftRecipient==='me'?buyerEmail:$('giftEmail').value.trim();
  const sendDate=giftSend==='later'?$('giftDate').value:null;
  if(!buyerName||!emailOk(buyerEmail)) return showError('Merci de renseigner votre nom et un e-mail valide.');
  if(!recipientName||!emailOk(recipientEmail)) return showError('Merci de renseigner le nom et un e-mail valide pour le destinataire.');
  if(giftSend==='later'&&!sendDate) return showError("Merci de choisir la date d’envoi.");
  if(sendDate){ const today=new Date();today.setHours(0,0,0,0); const d=new Date(sendDate+'T00:00:00'); if(d<today) return showError("La date d’envoi ne peut pas être dans le passé."); }
  const btn=$('giftPayButton'); const old=btn.textContent; btn.disabled=true; btn.textContent='Ouverture du paiement…';
  try{
    const r=await fetch('/.netlify/functions/create-gift-payment',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({value:giftValue,buyerName,buyerEmail,recipientMode:giftRecipient,recipientName,recipientEmail,message:$('giftMessage').value.trim(),sendMode:giftSend,sendDate})});
    const d=await r.json(); if(!r.ok||!d.checkoutUrl) throw new Error(d.error||'Paiement indisponible.');
    location.href=d.checkoutUrl;
  }catch(e){ showError(e.message||'Impossible de démarrer le paiement.'); btn.disabled=false; btn.textContent=old; }
}

document.querySelectorAll('.gift-value').forEach(el=>el.addEventListener('click',()=>{
  giftValue=Number(el.dataset.value);document.querySelectorAll('.gift-value').forEach(x=>x.classList.remove('selected'));el.classList.add('selected');refreshGift();
}));
$('giftForOther')?.addEventListener('click',()=>setRecipient('other'));
$('giftForMe')?.addEventListener('click',()=>setRecipient('me'));
$('sendNow')?.addEventListener('click',()=>setSend('now'));
$('sendLater')?.addEventListener('click',()=>setSend('later'));
$('giftPayButton')?.addEventListener('click',payGift);
const min=new Date().toISOString().slice(0,10); if($('giftDate')) $('giftDate').min=min;
refreshGift();
