(() => {
    const loading = document.getElementById("historyLoading");
    const empty = document.getElementById("historyEmpty");
    const list = document.getElementById("historyList");

    function escapeHtml(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function formatDate(value, withTime = false) {
        if (!value) return "—";

        const date = new Date(value);

        return date.toLocaleString("fr-FR", withTime ? {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        } : {
            day: "2-digit",
            month: "2-digit",
            year: "numeric"
        });
    }

    function statusLabel(row) {
        if (row.cancelled || row.status === "cancelled") {
            return "❌ Annulée";
        }
        if (row.status === "printed") {
            return "✓ Imprimée";
        }
        if (row.status === "failed") {
            return "⚠️ Échec";
        }
        return "⏳ En attente";
    }

    function statusDetails(row) {
        if (row.cancelled || row.status === "cancelled") {
            return `
                Annulée : ${formatDate(row.cancelled_at, true)}<br>
                Motif : ${escapeHtml(row.cancellation_reason || "—")}
            `;
        }

        if (row.status === "printed") {
            return `
                Imprimée : ${formatDate(row.printed_at, true)}
            `;
        }

        if (row.status === "failed") {
            return `
                Échec : ${formatDate(row.failed_at, true)}<br>
                Motif : ${escapeHtml(row.failure_reason || "—")}
            `;
        }

        return `
            Demandée : ${formatDate(row.requested_at, true)}
        `;
    }

    async function loadHistory() {
        try {
            const response = await fetch(
                "/.netlify/functions/admin-label-print-history",
                {
                    credentials: "same-origin"
                }
            );

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || "Erreur de chargement");
            }

            loading.classList.add("hidden");

            const rows = result.history || [];

            if (!rows.length) {
                empty.classList.remove("hidden");
                return;
            }

            list.innerHTML = rows.map(row => `
                <div style="
                    border-top:1px solid #e5e5e5;
                    padding:14px 0;
                ">
                    <div style="
                        display:flex;
                        justify-content:space-between;
                        gap:12px;
                        align-items:flex-start;
                    ">
                        <strong>${escapeHtml(row.product_name)}</strong>

                        <span style="
                            white-space:nowrap;
                            font-size:13px;
                            color:#666;
                        ">
                            ${Number(row.quantity) || 1} ×
                        </span>
                    </div>

                    <div style="
                        margin-top:6px;
                        font-size:14px;
                        line-height:1.5;
                        color:#444;
                    ">
                        Lot : <strong>${escapeHtml(row.lot)}</strong><br>
                        Préparé : ${formatDate(row.production_at, true)}<br>
                        DLC : ${formatDate(row.expiry_date)}<br>
                        Type : ${
                            row.label_type === "sale"
                                ? "Vente à emporter"
                                : "Préparation frigo"
                        }<br>
                        Statut : <strong>${statusLabel(row)}</strong><br>
                        ${statusDetails(row)}

                        ${row.original_print_id ? `
                            <div style="
                                margin-top:10px;
                                padding:10px;
                                border-radius:8px;
                                background:#f5f1e7;
                            ">
                                <strong>🔁 Réimpression</strong><br>
                                Motif : ${escapeHtml(row.reprint_reason || "—")}
                            </div>
                        ` : ""}
                    </div>

                    <button
                        type="button"
                        class="reprintBtn"
                        data-id="${escapeHtml(row.id)}"
                        style="
                            width:100%;
                            margin-top:10px;
                            padding:10px;
                            background:#eee;
                            color:#111;
                        "
                    >
                        🔁 Réimprimer ce lot
                    </button>

                    ${!row.cancelled ? `
                        <button
                            type="button"
                            class="cancelPrintBtn"
                            data-id="${escapeHtml(row.id)}"
                            style="
                                width:100%;
                                margin-top:8px;
                                padding:10px;
                                background:#fff;
                                color:#b00020;
                                border:1px solid #b00020;
                            "
                        >
                            ❌ Annuler cette impression
                        </button>
                    ` : ""}
                </div>
            `).join("");

            list.querySelectorAll(".cancelPrintBtn").forEach(button => {
                button.addEventListener("click", async () => {
                    const row = rows.find(r => r.id === button.dataset.id);
                    if (!row || row.cancelled) return;

                    const reason = window.prompt(
                        "Pourquoi annuler cette impression ?\n\n" +
                        "Exemple : erreur de DLC, étiquette abîmée, mauvais produit."
                    );

                    if (reason === null) return;

                    const cleanReason = reason.trim();

                    if (!cleanReason) {
                        window.alert(
                            "Le motif d'annulation est obligatoire."
                        );
                        return;
                    }

                    const confirmed = window.confirm(
                        "Confirmer l'annulation de l'impression du lot " +
                        row.lot +
                        " ?\n\nLa trace sera conservée."
                    );

                    if (!confirmed) return;

                    button.disabled = true;
                    button.textContent = "Annulation…";

                    try {
                        const response = await fetch(
                            "/.netlify/functions/admin-label-print-cancel",
                            {
                                method: "POST",
                                headers: {
                                    "Content-Type": "application/json"
                                },
                                credentials: "same-origin",
                                body: JSON.stringify({
                                    id: row.id,
                                    reason: cleanReason
                                })
                            }
                        );

                        const result =
                            await response.json().catch(() => ({}));

                        if (!response.ok) {
                            throw new Error(
                                result.error ||
                                "Impossible d'annuler l'impression."
                            );
                        }

                        await loadHistory();

                    } catch (error) {
                        console.error(error);

                        window.alert(
                            "Erreur : " + error.message
                        );

                        button.disabled = false;
                        button.textContent =
                            "❌ Annuler cette impression";
                    }
                });
            });

            list.querySelectorAll(".reprintBtn").forEach(button => {
                button.addEventListener("click", () => {
                    const row = rows.find(r => r.id === button.dataset.id);
                    if (!row) return;

                    const reason = window.prompt(
                        "Motif de la réimpression :\n\n" +
                        "Exemple : étiquette abîmée, impression illisible."
                    );

                    if (reason === null) return;

                    const cleanReason = reason.trim();

                    if (!cleanReason) {
                        window.alert(
                            "Le motif de réimpression est obligatoire."
                        );
                        return;
                    }

                    if (!window.LabelReprintContext) {
                        window.alert(
                            "Impossible d'enregistrer la provenance."
                        );
                        return;
                    }

                    window.LabelReprintContext.set(
                        row.id,
                        cleanReason
                    );

                    document.getElementById("customProduct").value =
                        row.product_name || "";

                    document.getElementById("product").value = "";

                    const production = new Date(row.production_at);
                    const localProduction = new Date(
                        production.getTime() -
                        production.getTimezoneOffset() * 60000
                    ).toISOString().slice(0,16);

                    document.getElementById("production").value =
                        localProduction;

                    document.getElementById("expiry").value =
                        row.expiry_date
                            ? String(row.expiry_date).slice(0,10)
                            : "";

                    document.getElementById("storage").value =
                        row.storage_instructions || "";

                    document.getElementById("allergens").value =
                        row.allergens || "";

                    document.getElementById("ingredients").value =
                        row.ingredients || "";

                    document.getElementById("weight").value =
                        row.net_weight || "";

                    document.getElementById("lot").value =
                        row.lot || "";

                    document.getElementById("labelQuantity").value = "1";

                    if (row.label_type === "sale") {
                        document.getElementById("saleMode").click();
                    } else {
                        document.getElementById("internalMode").click();
                    }

                    const expiry = new Date(
                        String(row.expiry_date).slice(0,10) + "T12:00:00"
                    );

                    const prodDate = new Date(row.production_at);

                    const days = Math.max(
                        1,
                        Math.round(
                            (expiry - prodDate) / 86400000
                        )
                    );

                    const lifeSelect =
                        document.getElementById("lifeDays");

                    if (
                        !Array.from(lifeSelect.options)
                            .some(o => o.value === String(days))
                    ) {
                        const option =
                            document.createElement("option");

                        option.value = String(days);
                        option.textContent = "J+" + days;

                        lifeSelect.appendChild(option);
                    }

                    lifeSelect.value = String(days);

                    ["input","change"].forEach(eventName => {
                        document
                            .getElementById("customProduct")
                            .dispatchEvent(
                                new Event(eventName, {
                                    bubbles:true
                                })
                            );
                    });

                    window.scrollTo({
                        top:0,
                        behavior:"smooth"
                    });

                    const status =
                        document.getElementById("status");

                    if (status) {
                        status.textContent =
                            "🔁 Lot " + row.lot +
                            " chargé. Vérifie puis appuie sur Imprimer.";
                    }
                });
            });

        } catch (error) {
            console.error(error);

            loading.textContent =
                "⚠️ Impossible de charger l'historique.";
        }
    }

    loadHistory();
})();

