let currentAccounts = [];

const $ = id => document.getElementById(id);

const escapeHtml = value =>
    String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");

const eventLabels = {
    welcome: "Bienvenue",
    order_earned: "Points gagnés",
    reward_redeemed: "Récompense utilisée",
    admin_adjustment: "Correction administrateur"
};

async function api(url, options = {}) {
    const response = await fetch(url, {
        credentials: "same-origin",
        cache: "no-store",
        ...options
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || "Une erreur est survenue.");
    }

    return data;
}

async function loadLoyalty() {
    $("loyalty-loading").style.display = "block";
    $("loyalty-empty").style.display = "none";

    try {
        const data = await api("/.netlify/functions/admin-loyalty");

        currentAccounts = data.accounts || [];

        $("loyalty-dashboard").style.display = "block";
        $("loyalty-loading").style.display = "none";

        updateSummary();
        filterAccounts();

    } catch (error) {
        $("loyalty-loading").style.display = "none";
        console.error("Chargement fidélité :", error);
    }
}

function updateSummary() {
    $("loyalty-count").textContent = currentAccounts.length;

    $("loyalty-points").textContent = currentAccounts.reduce(
        (total, account) => total + Number(account.points || 0),
        0
    );

    $("loyalty-earned").textContent = currentAccounts.reduce(
        (total, account) =>
            total + Number(account.earned_from_orders || 0),
        0
    );

    $("loyalty-rewards").textContent = currentAccounts.reduce(
        (total, account) =>
            total + (account.history || []).filter(
                entry => entry.event_type === "reward_redeemed"
            ).length,
        0
    );
}

function filterAccounts() {
    const search = $("loyalty-search").value.trim().toLowerCase();

    const filtered = currentAccounts.filter(account => {
        const text = [
            account.name,
            account.email
        ].join(" ").toLowerCase();

        return !search || text.includes(search);
    });

    renderAccounts(filtered);
}

function renderAccounts(accounts) {
    const list = $("loyalty-list");
    const empty = $("loyalty-empty");

    if (!accounts.length) {
        list.innerHTML = "";
        empty.style.display = "block";
        return;
    }

    empty.style.display = "none";

    list.innerHTML = accounts.map(account => {
        const history = (account.history || []).map(entry => {
            const points = Number(entry.points || 0);
            const sign = points > 0 ? "+" : "";

            return `
                <div class="loyalty-history-row">
                    <div>
                        <strong>
                            ${escapeHtml(
                                eventLabels[entry.event_type] ||
                                entry.event_type
                            )}
                        </strong>
                        <small>
                            ${escapeHtml(entry.note || "")}
                            ${
                                entry.order_ref
                                    ? ` · ${escapeHtml(entry.order_ref)}`
                                    : ""
                            }
                        </small>
                    </div>

                    <span class="${
                        points >= 0
                            ? "points-positive"
                            : "points-negative"
                    }">
                        ${sign}${points} pts
                    </span>
                </div>
            `;
        }).join("");

        return `
            <article class="loyalty-card">
                <div class="loyalty-card-header">
                    <div class="loyalty-client">
                        <div class="loyalty-avatar">
                            ${escapeHtml(
                                (account.name || account.email || "?")
                                    .charAt(0)
                                    .toUpperCase()
                            )}
                        </div>

                        <div>
                            <h3>
                                ${escapeHtml(
                                    account.name || "Client fidélité"
                                )}
                            </h3>
                            <div>${escapeHtml(account.email)}</div>
                        </div>
                    </div>

                    <div class="loyalty-balance">
                        <span>Solde actuel</span>
                        <strong>${Number(account.points || 0)} pts</strong>
                    </div>
                </div>

                <div class="loyalty-account-stats">
                    <div>
                        <span>Points gagnés sur commandes</span>
                        <strong>
                            ${Number(account.earned_from_orders || 0)} pts
                        </strong>
                    </div>

                    <div>
                        <span>Mouvements</span>
                        <strong>
                            ${Number(account.movement_count || 0)}
                        </strong>
                    </div>
                </div>

                <div style="
                    margin-top:18px;
                    padding:16px;
                    border:1px solid #ddd;
                    border-radius:12px;
                ">
                    <strong>Corriger les points</strong>

                    <p style="margin:6px 0 12px;font-size:14px;">
                        Utilisez un nombre positif pour ajouter des points
                        et un nombre négatif pour en retirer.
                    </p>

                    <div style="
                        display:grid;
                        grid-template-columns:minmax(110px,160px) 1fr auto;
                        gap:8px;
                        align-items:end;
                    ">
                        <label>
                            <span style="display:block;margin-bottom:5px;">
                                Points
                            </span>
                            <input
                                id="adjust-points-${account.id}"
                                type="number"
                                step="1"
                                placeholder="+10 ou -10"
                                style="width:100%;box-sizing:border-box;"
                            >
                        </label>

                        <label>
                            <span style="display:block;margin-bottom:5px;">
                                Motif
                            </span>
                            <input
                                id="adjust-note-${account.id}"
                                type="text"
                                maxlength="250"
                                placeholder="Ex. correction ticket boutique"
                                style="width:100%;box-sizing:border-box;"
                            >
                        </label>

                        <button
                            type="button"
                            class="primary-button"
                            onclick="adjustLoyaltyPoints(${account.id})"
                        >
                            Enregistrer
                        </button>
                    </div>

                    <div
                        id="adjust-message-${account.id}"
                        class="loyalty-message"
                        style="padding:8px 0 0;"
                    ></div>
                </div>

                <div class="loyalty-history">
                    <h4>Historique des points</h4>
                    ${history || "<p>Aucun mouvement.</p>"}
                </div>
            </article>
        `;
    }).join("");
}

async function adjustLoyaltyPoints(accountId) {
    const pointsInput = $(`adjust-points-${accountId}`);
    const noteInput = $(`adjust-note-${accountId}`);
    const message = $(`adjust-message-${accountId}`);

    const points = Number(pointsInput.value);
    const note = noteInput.value.trim();

    if (!Number.isSafeInteger(points) || points === 0) {
        message.textContent =
            "Indiquez un nombre entier positif ou négatif.";
        return;
    }

    if (!note) {
        message.textContent =
            "Le motif de la correction est obligatoire.";
        return;
    }

    const action =
        points > 0
            ? `ajouter ${points} point${points > 1 ? "s" : ""}`
            : `retirer ${Math.abs(points)} point${
                Math.abs(points) > 1 ? "s" : ""
            }`;

    if (!confirm(`Confirmer : ${action} ?`)) {
        return;
    }

    message.textContent = "Enregistrement…";

    try {
        await api("/.netlify/functions/admin-loyalty", {
            method: "POST",
            headers: {
                "content-type": "application/json"
            },
            body: JSON.stringify({
                account_id: accountId,
                points,
                note
            })
        });

        await loadLoyalty();

    } catch (error) {
        message.textContent = error.message;
    }
}

window.adjustLoyaltyPoints = adjustLoyaltyPoints;





$("loyalty-search").addEventListener("input", filterAccounts);

$("refresh-loyalty").addEventListener("click", loadLoyalty);

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
            await loadLoyalty();
        }
    } catch (error) {
        console.error("Session administrateur :", error);
    }
}

initialiseAdminSession();
