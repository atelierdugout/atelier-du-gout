const BREVO_URL = "https://api.brevo.com/v3/smtp/email";
const FROM_EMAIL = process.env.EMAIL_FROM || "commandes@atelierdugoutaulnay.com";
const FROM_NAME = process.env.EMAIL_FROM_NAME || "L’Atelier du Goût";
const REPLY_TO = process.env.EMAIL_REPLY_TO || "commandes@atelierdugoutaulnay.com";
const MERCHANT_EMAIL = process.env.ORDER_NOTIFICATION_EMAIL || "nicolas@atelierdugoutaulnay.com";

const esc = (v="") => String(v).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const euro = cents => new Intl.NumberFormat("fr-FR", {style:"currency",currency:"EUR"}).format((Number(cents)||0)/100);

export async function sendBrevoEmail({to, toName, subject, htmlContent, tag}) {
  if (!process.env.BREVO_API_KEY) throw new Error("BREVO_API_KEY absente.");
  const payload = {
    sender: {name: FROM_NAME, email: FROM_EMAIL},
    to: [{email: to, ...(toName ? {name: toName} : {})}],
    replyTo: {email: REPLY_TO, name: FROM_NAME},
    subject,
    htmlContent,
    ...(tag ? {tags:[tag]} : {})
  };
  const r = await fetch(BREVO_URL, {
    method:"POST",
    headers:{"accept":"application/json","api-key":process.env.BREVO_API_KEY,"content-type":"application/json"},
    body:JSON.stringify(payload)
  });
  const data = await r.json().catch(()=>({}));
  if (!r.ok) throw new Error(`Brevo ${r.status}: ${data.message || JSON.stringify(data)}`);
  return data;
}

function itemsTable(items) {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin:18px 0">
    ${items.map(i=>`<tr><td style="padding:9px 0;border-bottom:1px solid #e8e3d8">${esc(i.product_name)} × ${i.quantity}</td><td style="padding:9px 0;border-bottom:1px solid #e8e3d8;text-align:right;white-space:nowrap">${euro(i.line_total_cents)}</td></tr>`).join("")}
  </table>`;
}
function shell(content) {
  return `<!doctype html><html><body style="margin:0;background:#f7f4ec;font-family:Arial,sans-serif;color:#263021"><div style="max-width:640px;margin:0 auto;padding:28px 16px"><div style="background:#33402c;color:#fff;padding:22px 24px;font-family:Georgia,serif;font-size:24px">L’Atelier du Goût</div><div style="background:#fff;padding:26px 24px">${content}</div><div style="padding:18px 4px;font-size:12px;color:#68725c">3 place Aristide Briand, 17470 Aulnay · Réponse : ${esc(REPLY_TO)}</div></div></body></html>`;
}
function fulfillment(o) {
  const mode = o.mode === "delivery" ? "Livraison" : "Retrait à la boutique";
  const addr = o.mode === "delivery" && o.customer_address ? `<p><strong>Adresse :</strong> ${esc(o.customer_address)}</p>` : "";
  return `<p><strong>Mode :</strong> ${mode}</p><p><strong>Date :</strong> ${esc(o.service_date || "—")}</p><p><strong>Créneau :</strong> ${esc(o.service_slot || "—")}</p>${addr}`;
}
export function customerEmail(o, items) {
  const content = `<h1 style="font-family:Georgia,serif;font-size:26px;margin:0 0 16px">Commande confirmée</h1><p>Bonjour ${esc(o.customer_name || "")},</p><p>Votre paiement a bien été confirmé. Votre commande <strong>${esc(o.order_ref)}</strong> est enregistrée.</p>${itemsTable(items)}<p><strong>Sous-total :</strong> ${euro(o.subtotal_cents)}<br><strong>Livraison :</strong> ${euro(o.delivery_cents)}<br><strong>Total payé :</strong> ${euro(o.total_cents)}</p>${fulfillment(o)}${o.comments?`<p><strong>Commentaire :</strong> ${esc(o.comments)}</p>`:""}<p>Merci et à bientôt,<br>L’Atelier du Goût</p>`;
  return {subject:`Commande ${o.order_ref} confirmée — L’Atelier du Goût`, htmlContent:shell(content)};
}
export function merchantEmail(o, items) {
  const content = `<h1 style="font-family:Georgia,serif;font-size:26px;margin:0 0 16px">Nouvelle commande payée</h1><p><strong>${esc(o.order_ref)}</strong></p><p><strong>Client :</strong> ${esc(o.customer_name||"—")}<br><strong>Téléphone :</strong> ${esc(o.customer_phone||"—")}<br><strong>Email :</strong> ${esc(o.customer_email||"—")}</p>${itemsTable(items)}<p><strong>Sous-total :</strong> ${euro(o.subtotal_cents)}<br><strong>Livraison :</strong> ${euro(o.delivery_cents)}<br><strong>Total :</strong> ${euro(o.total_cents)}</p>${fulfillment(o)}${o.allergies?`<p><strong>Allergies signalées :</strong> ${esc(o.allergies)}</p>`:""}${o.comments?`<p><strong>Commentaire :</strong> ${esc(o.comments)}</p>`:""}`;
  return {subject:`Nouvelle commande payée ${o.order_ref} — ${euro(o.total_cents)}`, htmlContent:shell(content), to:MERCHANT_EMAIL};
}

export function readyEmail(o) {
  const isDelivery = o.mode === "delivery";

  const title = isDelivery
    ? "Votre commande va être livrée"
    : "Votre commande est prête";

  const message = isDelivery
    ? `Votre commande <strong>${esc(o.order_ref)}</strong> est prête et va être livrée.`
    : `Votre commande <strong>${esc(o.order_ref)}</strong> est prête à être retirée à L’Atelier du Goût.`;

  const content = `
    <h1 style="font-family:Georgia,serif;font-size:26px;margin:0 0 16px">${title}</h1>
    <p>Bonjour ${esc(o.customer_name || "")},</p>
    <p>${message}</p>
    ${fulfillment(o)}
    <p>Merci et à bientôt,<br>L’Atelier du Goût</p>
  `;

  return {
    subject: isDelivery
      ? `Votre commande ${o.order_ref} va être livrée — L’Atelier du Goût`
      : `Votre commande ${o.order_ref} est prête — L’Atelier du Goût`,
    htmlContent: shell(content)
  };
}

export function supplierOrderEmail({ supplier, order, items }) {
    const rows = items.map(item => `
        <tr>
            <td style="padding:9px 0;border-bottom:1px solid #e8e3d8">
                ${esc(item.product_name)}
            </td>
            <td style="padding:9px 0;border-bottom:1px solid #e8e3d8;text-align:center">
                ${esc(item.quantity)} ${esc(item.unit || "")}
            </td>
        </tr>
    `).join("");

    const content = `
        <h1 style="font-family:Georgia,serif;font-size:26px;margin:0 0 16px">
            Commande fournisseur
        </h1>

        <p>Bonjour,</p>

        <p>
            Nous souhaitons passer la commande suivante
            pour L’Atelier du Goût.
        </p>

        <table role="presentation" width="100%" cellspacing="0" cellpadding="0"
               style="border-collapse:collapse;margin:18px 0">
            <tr>
                <th style="padding:9px 0;text-align:left;border-bottom:2px solid #33402c">
                    Article
                </th>
                <th style="padding:9px 0;text-align:center;border-bottom:2px solid #33402c">
                    Quantité
                </th>
            </tr>
            ${rows}
        </table>

        ${order.reference
            ? `<p><strong>Référence :</strong> ${esc(order.reference)}</p>`
            : ""}

        ${order.notes
            ? `<p><strong>Notes :</strong> ${esc(order.notes)}</p>`
            : ""}

        <p>
            Merci de nous confirmer la disponibilité et le délai de livraison.
        </p>

        <p>
            Cordialement,<br>
            L’Atelier du Goût
        </p>
    `;

    return {
        subject: `Commande fournisseur${order.reference ? ` — ${order.reference}` : ""}`,
        htmlContent: shell(content)
    };
}
