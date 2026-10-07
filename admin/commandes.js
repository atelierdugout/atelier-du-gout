let currentScope = "upcoming";
let currentMode = "all";
let currentOrders = [];

const $ = (id) => document.getElementById(id);

const money = (cents) =>
    new Intl.NumberFormat("fr-FR", {
        style: "currency",
        currency: "EUR"
    }).format((Number(cents) || 0) / 100);

const escapeHtml = (value) =>
    String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");

const statusLabels = {
    new: "Nouvelle",
    preparing: "En préparation",
    ready: "Prête",
    completed: "Terminée"
};

const modeLabels = {
    pickup: "Retrait",
    delivery: "Livraison"
};

async function loadOrders() {
    $("orders-loading").style.display = "block";
    $("orders-empty").style.display = "none";
    $("orders-list").innerHTML = "";

    try {
        const response = await fetch(
            `/.netlify/functions/admin-orders?scope=${currentScope}&mode=${currentMode}`,
            {
                credentials: "same-origin",
                cache: "no-store"
            }
        );

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || "Impossible de charger les commandes.");
        }

        currentOrders = data.orders || [];

        $("orders-dashboard").style.display = "block";

        renderOrders();
    } catch (error) {
        $("orders-loading").style.display = "none";

        $("orders-list").innerHTML =
            `<div class="orders-error">${escapeHtml(error.message)}</div>`;
    }
}

function renderOrders() {
    $("orders-loading").style.display = "none";

    const query = ($("order-search")?.value || "").trim().toLowerCase();

    const orders = query
        ? currentOrders.filter((order) => {
            const searchable = [
                order.order_ref,
                order.customer_name,
                order.customer_phone,
                order.customer_email
            ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();

            return searchable.includes(query);
        })
        : currentOrders;

    $("orders-count").textContent = orders.length;

    $("orders-new-count").textContent = orders.filter(
        (order) =>
            order.fulfillment_status === "new" ||
            order.fulfillment_status === "preparing"
    ).length;

    $("orders-ready-count").textContent = orders.filter(
        (order) => order.fulfillment_status === "ready"
    ).length;

    const total = orders.reduce(
        (sum, order) => sum + (Number(order.total_cents) || 0),
        0
    );

    $("orders-total").textContent = money(total);

    if (!orders.length) {
        $("orders-empty").style.display = "block";
        $("orders-list").innerHTML = "";
        return;
    }

    $("orders-empty").style.display = "none";

    $("orders-list").innerHTML = orders.map(orderCard).join("");
}

function orderCard(order) {
    const status = order.fulfillment_status || "new";

    const items = (order.items || []).map((item) => `
        <div class="order-item">
            <div>
                <strong>${escapeHtml(item.quantity)} × ${escapeHtml(item.product_name)}</strong>
            </div>
            <span>${money(item.line_total_cents)}</span>
        </div>
    `).join("");

    const statusOptions = [
        ["new", "Commande reçue"],
        ["preparing", "En préparation"],
        ["ready", "Prête"],
        ["completed", "Terminée"]
    ].map(([value, label]) =>
        `<option value="${value}" ${value === status ? "selected" : ""}>${label}</option>`
    ).join("");

    const actions = `
        <div class="order-admin-actions">
            <label>
                Statut
                <select onchange="changeOrderStatus('${order.id}', this.value)">
                    ${statusOptions}
                </select>
            </label>

            <button
                type="button"
                class="secondary-button"
                onclick="printOrder('${order.id}')">
                Imprimer
            </button>
        </div>
    `;

    const service =
        [order.service_date, order.service_slot]
            .filter(Boolean)
            .join(" • ") || "Date non renseignée";

    const address = order.customer_address
        ? `<div><strong>Adresse :</strong> ${escapeHtml(order.customer_address)}</div>`
        : "";

    const allergies = order.allergies
        ? `<div class="order-warning"><strong>Allergies :</strong> ${escapeHtml(order.allergies)}</div>`
        : "";

    const comments = order.comments
        ? `<div class="order-note"><strong>Commentaire :</strong> ${escapeHtml(order.comments)}</div>`
        : "";

    const giftCard = Number(order.gift_card_cents) > 0
        ? `<div><span>Carte cadeau</span><strong>− ${money(order.gift_card_cents)}</strong></div>`
        : "";

    const loyalty = Number(order.loyalty_discount_cents) > 0
        ? `<div><span>Fidélité</span><strong>− ${money(order.loyalty_discount_cents)}</strong></div>`
        : "";

    return `
        <article class="order-card">

            <div class="order-card-header">
                <div>
                    <div class="order-reference">
                        ${escapeHtml(order.order_ref || `Commande ${order.id}`)}
                    </div>

                    <div class="order-service">
                        ${escapeHtml(service)}
                    </div>
                </div>

                <div class="order-header-right">
                    <span class="order-mode">
                        ${escapeHtml(modeLabels[order.mode] || order.mode || "Commande")}
                    </span>

                    <span class="order-status status-${escapeHtml(status)}">
                        ${escapeHtml(statusLabels[status] || status)}
                    </span>
                </div>
            </div>

            <div class="order-card-body">

                <div class="order-customer">
                    <h3>${escapeHtml(order.customer_name || "Client")}</h3>

                    ${order.customer_phone
                        ? `<div>${escapeHtml(order.customer_phone)}</div>`
                        : ""
                    }

                    ${order.customer_email
                        ? `<div>${escapeHtml(order.customer_email)}</div>`
                        : ""
                    }

                    ${order.customer_phone || order.customer_email ? `
                        <div class="order-contact-actions">
                            ${order.customer_phone
                                ? `<a class="secondary-button" href="tel:${escapeHtml(String(order.customer_phone).replace(/\\s+/g, ""))}">Appeler</a>`
                                : ""
                            }
                            ${order.customer_email
                                ? `<a class="secondary-button" href="mailto:${escapeHtml(order.customer_email)}">E-mail</a>`
                                : ""
                            }
                        </div>
                    ` : ""}

                    ${address}
                    ${allergies}
                    ${comments}
                </div>

                <div class="order-items">
                    <h3>Commande</h3>
                    ${items || "<div>Aucun article.</div>"}
                </div>

                <div class="order-payment">
                    <div>
                        <span>Sous-total</span>
                        <strong>${money(order.subtotal_cents)}</strong>
                    </div>

                    ${Number(order.delivery_cents) > 0 ? `
                        <div>
                            <span>Livraison</span>
                            <strong>${money(order.delivery_cents)}</strong>
                        </div>
                    ` : ""}

                    ${giftCard}
                    ${loyalty}

                    <div class="order-total-line">
                        <span>Total</span>
                        <strong>${money(order.total_cents)}</strong>
                    </div>
                </div>

            </div>

            <div class="order-card-footer">
                ${actions}
            </div>

        </article>
    `;
}

function printOrder(orderId) {
    const order = currentOrders.find(
        (item) => String(item.id) === String(orderId)
    );

    if (!order) {
        alert("Commande introuvable.");
        return;
    }

    const popup = window.open("", "_blank", "width=760,height=900");

    if (!popup) {
        alert("Le navigateur a bloqué la fenêtre d'impression.");
        return;
    }

    const service = [order.service_date, order.service_slot]
        .filter(Boolean)
        .join(" • ") || "Date non renseignée";

    const mode = modeLabels[order.mode] || order.mode || "Commande";

    const items = (order.items || []).map((item) =>
        `<tr>
            <td>${escapeHtml(item.quantity)} × ${escapeHtml(item.product_name)}</td>
            <td style="text-align:right">${money(item.line_total_cents)}</td>
        </tr>`
    ).join("");

    popup.document.write(`<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>${escapeHtml(order.order_ref || "Commande")}</title>
<style>
body{font-family:Arial,sans-serif;color:#111;margin:32px}
h1{margin:0 0 6px;font-size:26px}
.meta{margin-bottom:24px;font-size:16px}
.box{border-top:1px solid #bbb;padding:14px 0}
table{width:100%;border-collapse:collapse}
td{padding:8px 0;border-bottom:1px solid #ddd}
.warning{font-weight:700;border:2px solid #111;padding:10px;margin-top:14px}
.total{text-align:right;font-size:20px;font-weight:700;margin-top:18px}
@media print{button{display:none}body{margin:12mm}}
</style>
</head>
<body>
<h1>${escapeHtml(order.order_ref || "Commande")}</h1>
<div class="meta">
<strong>${escapeHtml(mode)}</strong><br>
${escapeHtml(service)}
</div>

<div class="box">
<strong>${escapeHtml(order.customer_name || "Client")}</strong><br>
${order.customer_phone ? escapeHtml(order.customer_phone) + "<br>" : ""}
${order.customer_email ? escapeHtml(order.customer_email) + "<br>" : ""}
${order.customer_address ? escapeHtml(order.customer_address) : ""}
</div>

<div class="box">
<h2>Commande</h2>
<table>${items}</table>
<div class="total">Total : ${money(order.total_cents)}</div>
</div>

${order.allergies
    ? `<div class="warning">ALLERGIES : ${escapeHtml(order.allergies)}</div>`
    : ""}

${order.comments
    ? `<div class="box"><strong>Commentaire :</strong><br>${escapeHtml(order.comments)}</div>`
    : ""}

<script>
window.onload=()=>window.print();
<\/script>
</body>
</html>`);

    popup.document.close();
}

async function changeOrderStatus(orderId, status) {
    try {
        const response = await fetch("/.netlify/functions/admin-orders", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
                credentials: "same-origin",
            body: JSON.stringify({
                order_id: String(orderId),
                status
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || "Impossible de modifier la commande.");
        }

        await loadOrders();
    } catch (error) {
        alert(error.message);
    }
}





document.querySelectorAll(".order-tab").forEach((button) => {
    button.addEventListener("click", () => {
        document.querySelectorAll(".order-tab").forEach((tab) =>
            tab.classList.remove("active")
        );

        button.classList.add("active");
        currentScope = button.dataset.scope;

        loadOrders();
    });
});

$("order-mode").addEventListener("change", () => {
    currentMode = $("order-mode").value;
    loadOrders();
});

$("refresh-orders").addEventListener("click", () => {
    loadOrders();
});

async function initialiseAdminSession() {
    try {
        const response = await fetch(
            "/.netlify/functions/admin-session-status",
            {
                credentials: "same-origin",
                cache: "no-store"
            }
        );

        const data = await response.json();

        if (response.ok && data.authenticated) {
            $("orders-dashboard").style.display = "block";
            await loadOrders();
        }
    } catch (error) {
        console.error("Session administrateur :", error);
    }
}

window.changeOrderStatus = changeOrderStatus;
window.printOrder = printOrder;

initialiseAdminSession();


$("order-search")?.addEventListener("input", () => {
    renderOrders();
});
