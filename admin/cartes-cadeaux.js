const $ = (id) => document.getElementById(id);

let currentCode = "";

const money = (cents) =>
    `${(Number(cents || 0) / 100).toFixed(2).replace(".", ",")} €`;

const dateText = (value) => {
    if (!value) return "—";
    const date = new Date(value);
    return Number.isNaN(date.getTime())
        ? String(value)
        : date.toLocaleString("fr-FR");
};

const escapeHtml = (value = "") =>
    String(value).replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    }[char]));







async function searchGift() {
    const code = $("gift-code").value.trim().toUpperCase();
    $("gift-error").textContent = "";
    $("redeem-message").textContent = "";

    if (!code) {
        $("gift-error").textContent =
            "Saisissez le code de la carte cadeau.";
        return;
    }

    try {
        const response = await fetch(
            "/.netlify/functions/admin-gift-card",
            {
                method: "POST",
                credentials: "same-origin",
                cache: "no-store",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ code })
            }
        );

        const data = await response.json();

        if (!response.ok) {
            throw new Error(
                data.error || "Impossible de consulter cette carte."
            );
        }

        currentCode = code;
        renderGift(data.card, data.history || []);
    } catch (error) {
        $("gift-result").style.display = "none";
        $("gift-error").textContent =
            error.message || "Consultation impossible.";
    }
}

function renderGift(card, history) {
    $("gift-result").style.display = "block";

    $("gift-initial").textContent = money(card.initial_cents);
    $("gift-balance").textContent = money(card.balance_cents);

    const statuses = {
        active: "Active",
        depleted: "Épuisée",
        disabled: "Désactivée"
    };

    $("gift-status").textContent =
        statuses[card.status] || card.status || "—";

    $("gift-issued").textContent = dateText(card.issued_at);

    $("gift-details").innerHTML = `
        <p><strong>Acheteur :</strong>
            ${escapeHtml(card.buyer_name || "—")}
            ${card.buyer_email
                ? ` — ${escapeHtml(card.buyer_email)}`
                : ""}
        </p>
        <p><strong>Destinataire :</strong>
            ${escapeHtml(card.recipient_name || "—")}
            ${card.recipient_email
                ? ` — ${escapeHtml(card.recipient_email)}`
                : ""}
        </p>
        <p><strong>Référence :</strong>
            ${escapeHtml(card.purchase_ref || "—")}
        </p>
        <p><strong>Fin du code :</strong>
            •••• ${escapeHtml(card.code_last4 || "")}
        </p>
    `;

    if (!history.length) {
        $("gift-history").innerHTML =
            "<p>Aucun mouvement enregistré.</p>";
        return;
    }

    $("gift-history").innerHTML = history.map((item) => {
        const amount = Number(item.amount_cents || 0);
        const sign = amount > 0 ? "+" : "";

        return `
            <div style="padding:14px 0;border-bottom:1px solid #ddd;">
                <div>
                    <strong>${sign}${money(amount)}</strong>
                    — ${escapeHtml(item.note || item.event_type || "Mouvement")}
                </div>
                <small>
                    ${escapeHtml(dateText(item.created_at))}
                    ${item.order_ref
                        ? ` · ${escapeHtml(item.order_ref)}`
                        : ""}
                </small>
            </div>
        `;
    }).join("");
}

async function redeemGift() {
    if (!currentCode) return;

    const amount = Number(
        String($("redeem-amount").value).replace(",", ".")
    );

    if (!Number.isFinite(amount) || amount <= 0) {
        $("redeem-message").textContent =
            "Indiquez un montant valide.";
        return;
    }

    if (!confirm(
        `Débiter ${amount.toFixed(2).replace(".", ",")} € de cette carte cadeau ?`
    )) return;

    $("redeem-message").textContent = "Débit en cours…";

    try {
        const response = await fetch(
            "/.netlify/functions/admin-gift-redeem",
            {
                method: "POST",
                credentials: "same-origin",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    code: currentCode,
                    amount,
                    note: $("redeem-note").value.trim()
                })
            }
        );

        const data = await response.json();

        if (!response.ok) {
            throw new Error(
                data.error || "Impossible de débiter la carte."
            );
        }

        $("redeem-amount").value = "";
        $("redeem-note").value = "";
        $("redeem-message").textContent =
            `Débit enregistré. Nouveau solde : ${money(data.balance_cents)}.`;

        await searchGift();
    } catch (error) {
        $("redeem-message").textContent =
            error.message || "Débit impossible.";
    }
}

$("search-gift").addEventListener("click", searchGift);

$("gift-code").addEventListener("keydown", (event) => {
    if (event.key === "Enter") searchGift();
});

$("redeem-gift").addEventListener("click", redeemGift);

