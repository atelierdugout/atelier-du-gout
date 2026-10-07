let currentClients = [];

const $ = id => document.getElementById(id);

const money = cents =>
    new Intl.NumberFormat("fr-FR", {
        style: "currency",
        currency: "EUR"
    }).format((Number(cents) || 0) / 100);

const escapeHtml = value =>
    String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");

async function loadClients() {
    $("clients-loading").style.display = "block";
    $("clients-empty").style.display = "none";

    try {
        const response = await fetch("/.netlify/functions/admin-clients", {
            credentials: "same-origin",
            cache: "no-store"
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || "Impossible de charger les clients.");
        }

        currentClients = data.clients || [];

        $("clients-dashboard").style.display = "block";
        $("clients-loading").style.display = "none";

        updateSummary();
        filterClients();

    } catch (error) {
        $("clients-loading").style.display = "none";
    }
}

function updateSummary() {
    $("clients-count").textContent = currentClients.length;

    const orders = currentClients.reduce(
        (total, client) => total + Number(client.order_count || 0),
        0
    );

    $("clients-orders").textContent = orders;

    const revenue = currentClients.reduce(
        (total, client) => total + Number(client.total_spent_cents || 0),
        0
    );

    $("clients-revenue").textContent = money(revenue);

    $("clients-loyalty").textContent = currentClients.filter(
        client => client.loyalty_account_id
    ).length;
}

function filterClients() {
    const search = $("client-search").value.trim().toLowerCase();
    const filter = $("client-filter").value;

    const filtered = currentClients.filter(client => {
        const text = [
            client.name,
            client.email,
            client.phone
        ].join(" ").toLowerCase();

        const matchesSearch = !search || text.includes(search);

        let matchesFilter = true;

        if (filter === "loyalty") {
            matchesFilter = Boolean(client.loyalty_account_id);
        }

        if (filter === "no-loyalty") {
            matchesFilter = !client.loyalty_account_id;
        }

        return matchesSearch && matchesFilter;
    });

    renderClients(filtered);
}

function renderClients(clients) {
    const list = $("clients-list");
    const empty = $("clients-empty");

    if (!clients.length) {
        list.innerHTML = "";
        empty.style.display = "block";
        return;
    }

    empty.style.display = "none";

    list.innerHTML = clients.map(client => `
        <article class="client-card">

            <div class="client-main">
                <div class="client-avatar">
                    ${escapeHtml((client.name || client.email || "?").charAt(0).toUpperCase())}
                </div>

                <div class="client-identity">
                    <h3>${escapeHtml(client.name || "Client")}</h3>
                    <div>${escapeHtml(client.email || "")}</div>
                    <div>${escapeHtml(client.phone || "")}</div>
                </div>
            </div>

            <div class="client-data">
                <span>Commandes</span>
                <strong>${Number(client.order_count || 0)}</strong>
            </div>

            <div class="client-data">
                <span>Total dépensé</span>
                <strong>${money(client.total_spent_cents)}</strong>
            </div>

            <div class="client-data">
                <span>Fidélité</span>

                ${client.loyalty_account_id
                    ? `
                        <strong>${Number(client.loyalty_points || 0)} pts</strong>
                        <small class="client-loyalty-active">Compte actif</small>
                    `
                    : `
                        <strong>—</strong>
                        <small>Pas de compte</small>
                    `
                }
            </div>

        </article>
    `).join("");
}





$("client-search").addEventListener("input", filterClients);
$("client-filter").addEventListener("change", filterClients);

$("refresh-clients").addEventListener("click", () => {
    loadClients();
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
            await loadClients();
        }
    } catch (error) {
        console.error("Session administrateur :", error);
    }
}

initialiseAdminSession();
