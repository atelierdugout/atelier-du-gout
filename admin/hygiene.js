(() => {
    const API = "/.netlify/functions";
    let hygieneData = null;

    const escapeHtml = value =>
        String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");

    const MODULE_LABELS = {
        "equipment temperatures": "Températures équipements",
        "temperature monitoring": "Suivi des températures",
        "cleaning": "Nettoyage",
        "traceability": "Traçabilité",
        "reception purchases": "Réception des achats",
        "oil stations": "Huiles",
        "delivery": "Livraisons",
        "staff timecards": "Suivi du personnel",
        "label printing manufacturing": "Étiquettes fabrication",
        "label printing product": "Étiquettes produits",
        "label printing autocontrol products": "Étiquettes autocontrôle produits",
        "label printing autocontrol elements": "Étiquettes autocontrôle éléments",
        "cleaning control": "Contrôle nettoyage",
        "ph monitoring": "Contrôle pH",
        "dlc": "DLC",
        "reception control": "Contrôle réception",
        "autocontrol": "Autocontrôles",
        "spontaneous anomaly": "Anomalies",
        "food traceability": "Traçabilité alimentaire",
        "subcontractor interventions": "Interventions",
        "shuttles": "Navettes"
    };

    function moduleLabel(code) {
        return MODULE_LABELS[String(code || "").toLowerCase()]
            || String(code || "Module");
    }

    function setText(id, value) {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    }

    function empty(message) {
        return `
            <div class="hygiene-empty">
                ${escapeHtml(message)}
            </div>
        `;
    }

    function renderConnection(data) {
        const dot = document.getElementById("hygiene-connection-dot");

        if (dot) {
            dot.classList.remove("error");
            dot.classList.add("connected");
        }

        setText(
            "hygiene-connection-title",
            "Hygiène Expert connecté"
        );

        setText(
            "hygiene-connection-detail",
            `Site ${data?.hygieneExpert?.siteId ?? "—"} · ${data?.hygieneExpert?.client ?? "L'ATELIER DU GOUT"}`
        );
    }

    function renderSummary(data) {
        setText(
            "hygiene-total-activity",
            data?.summary?.totalActivity ?? 0
        );

        setText(
            "hygiene-active-modules",
            data?.summary?.activeModules ?? 0
        );

        setText(
            "hygiene-modules-available",
            data?.summary?.modulesAvailable ?? 0
        );

        const year = data?.hygieneExpert?.period?.year;
        const month = data?.hygieneExpert?.period?.month;

        if (year && month) {
            const label = new Intl.DateTimeFormat(
                "fr-FR",
                {
                    month: "long",
                    year: "numeric"
                }
            ).format(new Date(year, month - 1, 1));

            setText(
                "hygiene-period",
                `Données Hygiène Expert · ${label}`
            );
        }
    }

    function renderActivity(data) {
        const container =
            document.getElementById("hygiene-modules");

        if (!container) return;

        const items =
            data?.activity?.ViewAGGlobalModulesActivityList || [];

        if (!items.length) {
            container.innerHTML =
                empty("Aucune donnée d'activité disponible.");
            return;
        }

        container.innerHTML = items.map(item => {
            const value = Number(item?.Value || 0);

            return `
                <div class="hygiene-item">
                    <div>
                        <strong>
                            ${escapeHtml(moduleLabel(item?.Code))}
                        </strong>
                    </div>

                    <span class="hygiene-status ${value ? "ok" : "zero"}">
                        ${value}
                    </span>
                </div>
            `;
        }).join("");
    }

    function findArrays(value, result = []) {
        if (!value || typeof value !== "object") {
            return result;
        }

        if (Array.isArray(value)) {
            if (value.length) result.push(value);

            for (const item of value) {
                findArrays(item, result);
            }

            return result;
        }

        for (const child of Object.values(value)) {
            findArrays(child, result);
        }

        return result;
    }

    function renderGenericData(id, source, emptyMessage) {
        const container = document.getElementById(id);
        if (!container) return;

        const arrays = findArrays(source);
        const rows = arrays.find(array => array.length) || [];

        if (!rows.length) {
            container.innerHTML = empty(emptyMessage);
            return;
        }

        container.innerHTML = rows.slice(0, 20).map((item, index) => {
            if (
                item === null ||
                typeof item !== "object"
            ) {
                return `
                    <div class="hygiene-item">
                        <strong>${escapeHtml(item)}</strong>
                    </div>
                `;
            }

            const name =
                item.Name ??
                item.name ??
                item.Code ??
                item.code ??
                item.Module ??
                item.module ??
                item.Label ??
                item.label ??
                `Élément ${index + 1}`;

            const value =
                item.Value ??
                item.value ??
                item.Count ??
                item.count ??
                item.Total ??
                item.total ??
                item.Conformity ??
                item.conformity ??
                "";

            return `
                <div class="hygiene-item">
                    <div>
                        <strong>
                            ${escapeHtml(moduleLabel(name))}
                        </strong>
                    </div>

                    ${
                        value !== ""
                            ? `
                                <span class="hygiene-status">
                                    ${escapeHtml(value)}
                                </span>
                              `
                            : ""
                    }
                </div>
            `;
        }).join("");
    }

    function renderTasks(data) {
        const container = document.getElementById("hygiene-tasks");
        if (!container) return;

        const sites = Array.isArray(data?.tasks) ? data.tasks : [];

        if (!sites.length) {
            container.innerHTML =
                empty("Aucune tâche HACCP enregistrée pour cette période.");
            return;
        }

        const site = sites[0] || {};

        const categories = [
            ["Températures", site.temperature_count],
            ["Nettoyage", site.cleaning_count],
            ["Check-lists", site.checklist_count]
        ];

        container.innerHTML = categories.map(([label, counts]) => {
            const done = Number(counts?.count_done_task || 0);
            const late = Number(counts?.count_late_task || 0);
            const canceled = Number(counts?.count_canceled_task || 0);

            const statusClass = late > 0 ? "warning" : "ok";
            const statusText = late > 0
                ? late + " en retard"
                : "À jour";

            return `
                <div class="hygiene-item">
                    <div>
                        <strong>${escapeHtml(label)}</strong>
                        <small>
                            ${done} réalisée${done !== 1 ? "s" : ""}
                            · ${late} en retard
                            ${canceled ? " · " + canceled + " annulée" + (canceled !== 1 ? "s" : "") : ""}
                        </small>
                    </div>

                    <span class="hygiene-status ${statusClass}">
                        ${escapeHtml(statusText)}
                    </span>
                </div>
            `;
        }).join("");
    }

    function renderAlerts(data) {
        const container =
            document.getElementById("hygiene-alerts");

        if (!container) return;

        const alerts = data?.alerts || [];

        if (!alerts.length) {
            container.innerHTML =
                empty("Aucune alerte HACCP signalée.");
            return;
        }

        container.innerHTML = alerts.map(alert => `
            <div class="hygiene-item">
                <div>
                    <strong>
                        ${alert?.type === "info" ? "Information" : "Alerte"}
                    </strong>

                    <small>
                        ${escapeHtml(alert?.message || "")}
                    </small>
                </div>

                <span class="hygiene-status ${alert?.type === "info" ? "zero" : "warning"}">
                    ${alert?.type === "info" ? "Information" : "À vérifier"}
                </span>
            </div>
        `).join("");
    }

    function render(data) {
        renderConnection(data);
        renderSummary(data);
        renderActivity(data);

        renderGenericData(
            "hygiene-conformity",
            data?.conformityByModule,
            "Aucune donnée de conformité pour cette période."
        );

        renderTasks(data);

        renderGenericData(
            "hygiene-temperatures",
            data?.nonConformingTemperatures,
            "Aucune température non conforme signalée."
        );

        renderAlerts(data);
    }

    function renderError(error) {
        const dot =
            document.getElementById("hygiene-connection-dot");

        if (dot) {
            dot.classList.remove("connected");
            dot.classList.add("error");
        }

        setText(
            "hygiene-connection-title",
            "Connexion Hygiène Expert indisponible"
        );

        setText(
            "hygiene-connection-detail",
            error.message
        );

        [
            "hygiene-modules",
            "hygiene-conformity",
            "hygiene-tasks",
            "hygiene-temperatures",
            "hygiene-alerts"
        ].forEach(id => {
            const el = document.getElementById(id);

            if (el) {
                el.innerHTML = `
                    <div class="hygiene-error">
                        ${escapeHtml(error.message)}
                    </div>
                `;
            }
        });
    }

    async function loadHygiene() {
        const refresh =
            document.getElementById("hygiene-refresh");

        try {
            if (refresh) {
                refresh.disabled = true;
                refresh.textContent = "Actualisation…";
            }

            const session =
                await window.AdminAuth.sessionStatus();

            if (!session) {
                throw new Error(
                    "Session administrateur introuvable."
                );
            }

            const response = await fetch(
                `${API}/admin-hygiene`,
                {
                    credentials: "same-origin",
                    cache: "no-store"
                }
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(
                    data?.error ||
                    `Erreur HTTP ${response.status}`
                );
            }

            hygieneData = data;
            render(data);

        } catch (error) {
            console.error("[HACCP]", error);
            renderError(error);

        } finally {
            if (refresh) {
                refresh.disabled = false;
                refresh.textContent = "Actualiser";
            }
        }
    }

    document.addEventListener(
        "DOMContentLoaded",
        () => {
            document
                .getElementById("hygiene-refresh")
                ?.addEventListener(
                    "click",
                    loadHygiene
                );

            loadHygiene();
        }
    );

    window.HygieneAdmin = {
        reload: loadHygiene,
        getData: () => hygieneData
    };
})();

/* === Saisie températures → Hygiène Expert === */
(() => {
    const form = document.getElementById("hygiene-temperature-form");
    if (!form) return;

    const equipment = document.getElementById("hygiene-temperature-equipment");
    const recordedAt = document.getElementById("hygiene-temperature-date");
    const temperature = document.getElementById("hygiene-temperature-value");
    const photo = document.getElementById("hygiene-temperature-photo");
    const submit = document.getElementById("hygiene-temperature-submit");
    const retryPhoto = document.getElementById("hygiene-temperature-photo-retry");
    const result = document.getElementById("hygiene-temperature-result");

    let pendingPhotoRetry = null;

    function showResult(message, type = "") {
        result.textContent = message;
        result.className = type;
    }

    let fillingFromTask = false;

    function clearSelectedTask() {
        if (!fillingFromTask) {
            delete form.dataset.taskId;
        }
    }

    equipment?.addEventListener("change", clearSelectedTask);
    recordedAt?.addEventListener("change", clearSelectedTask);

    async function uploadEvidencePhoto(
        equipmentId,
        options = {}
    ) {
        const file = photo?.files?.[0];

        if (!file) {
            return null;
        }

        const formData = new FormData();
        formData.append("image", file);
        formData.append("equipment_id", String(equipmentId));
        formData.append(
            "recorded_at",
            options.recordedAt || recordedAt.value
        );
        formData.append(
            "task_id",
            options.taskId || form.dataset.taskId || ""
        );

        const response = await fetch(
            "/.netlify/functions/admin-hygiene-photo",
            {
                method: "POST",
                credentials: "same-origin",
                body: formData
            }
        );

        let data = {};

        try {
            data = await response.json();
        } catch {}

        if (!response.ok) {
            throw new Error(
                data?.error ||
                `Impossible d'enregistrer la photo (${response.status}).`
            );
        }

        return data;
    }

    retryPhoto?.addEventListener("click", async () => {
        if (!pendingPhotoRetry) {
            showResult(
                "Aucune photo en attente d'envoi.",
                "warning"
            );
            retryPhoto.hidden = true;
            return;
        }

        if (!photo?.files?.[0]) {
            showResult(
                "La photo n'est plus sélectionnée. Sélectionne-la à nouveau avant de réessayer.",
                "warning"
            );
            return;
        }

        retryPhoto.disabled = true;
        submit.disabled = true;

        try {
            showResult(
                "Nouvel envoi de la photo de preuve…"
            );

            await uploadEvidencePhoto(
                pendingPhotoRetry.equipmentId,
                {
                    taskId: pendingPhotoRetry.taskId,
                    recordedAt: pendingPhotoRetry.recordedAt
                }
            );

            pendingPhotoRetry = null;
            photo.value = "";
            retryPhoto.hidden = true;

            showResult(
                "Le relevé était déjà enregistré. La photo de preuve est maintenant enregistrée.",
                "success"
            );

            if (window.HygieneTasks?.reload) {
                await window.HygieneTasks.reload();
            }

        } catch (error) {
            showResult(
                `Le relevé reste enregistré, mais la photo n'a toujours pas pu être envoyée : ${error?.message || "erreur inconnue"}`,
                "warning"
            );
        } finally {
            retryPhoto.disabled = false;
            submit.disabled = false;
        }
    });

    form.addEventListener("submit", async event => {
        event.preventDefault();

        const equipmentId = Number(equipment.value);
        const temperatureValue = Number(temperature.value);

        if (!equipmentId) {
            showResult("Sélectionne un matériel.", "error");
            return;
        }

        if (!recordedAt.value) {
            showResult("Sélectionne la date et l'heure du relevé.", "error");
            return;
        }

        if (!Number.isFinite(temperatureValue)) {
            showResult("Saisis une température valide.", "error");
            return;
        }

        const equipmentLabel =
            equipment.options[equipment.selectedIndex]?.text ||
            "Matériel";

        const hasPhoto = Boolean(photo?.files?.[0]);

        const confirmed = window.confirm(
            `Enregistrer ${temperatureValue.toFixed(1)} °C pour ${equipmentLabel} dans Hygiène Expert${hasPhoto ? " avec une photo de preuve" : ""} ?`
        );

        if (!confirmed) return;

        submit.disabled = true;

        let evidence = null;

        try {
            showResult("Enregistrement dans Hygiène Expert…");

            const response = await fetch(
                "/.netlify/functions/admin-hygiene-temperature-expert",
                {
                    method: "POST",
                    credentials: "same-origin",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        equipment_id: equipmentId,
                        temperature: temperatureValue,
                        recorded_at: recordedAt.value,
                        task_id: form.dataset.taskId || null
                    })
                }
            );

            let data = {};

            try {
                data = await response.json();
            } catch {}

            if (!response.ok) {
                throw new Error(
                    data?.error ||
                    `Erreur Hygiène Expert (${response.status})`
                );
            }

            let photoError = null;

            if (hasPhoto) {
                showResult(
                    "Relevé enregistré · enregistrement de la photo de preuve…"
                );

                try {
                    evidence = await uploadEvidencePhoto(equipmentId);
                } catch (error) {
                    photoError = error;

                    pendingPhotoRetry = {
                        taskId: form.dataset.taskId || "",
                        equipmentId,
                        recordedAt: recordedAt.value
                    };

                    if (retryPhoto) {
                        retryPhoto.hidden = false;
                    }

                    console.error(
                        "Relevé HACCP enregistré, mais échec de la photo :",
                        error
                    );
                }
            }

            const photoText =
                evidence?.path
                    ? " · photo de preuve enregistrée"
                    : "";

            temperature.value = "";

            if (!photoError && photo) {
                photo.value = "";
                pendingPhotoRetry = null;

                if (retryPhoto) {
                    retryPhoto.hidden = true;
                }
            }

            delete form.dataset.taskId;

            if (window.HygieneTasks?.reload) {
                await window.HygieneTasks.reload();
            }

            const refresh = document.getElementById("hygiene-refresh");
            if (refresh) refresh.click();

            if (photoError) {
                showResult(
                    `Relevé enregistré dans Hygiène Expert${data?.record_id ? ` · n° ${data.record_id}` : ""}, mais la photo de preuve n'a pas pu être enregistrée : ${photoError.message || "erreur inconnue"}`,
                    "warning"
                );
            } else if (
                data?.is_anomaly === true ||
                data?.conformity === false
            ) {
                showResult(
                    `Relevé enregistré${data?.record_id ? ` · n° ${data.record_id}` : ""}${photoText}. Hygiène Expert signale une anomalie.`,
                    "warning"
                );
            } else {
                showResult(
                    `Relevé enregistré dans Hygiène Expert${data?.record_id ? ` · n° ${data.record_id}` : ""}${photoText}.`,
                    "success"
                );
            }

        } catch (error) {
            showResult(
                error?.message || "Impossible d'enregistrer le relevé.",
                "error"
            );
        } finally {
            submit.disabled = false;
        }
    });
})();

/* === Tâches HACCP quotidiennes === */
(() => {
    const container = document.getElementById("hygiene-daily-tasks");
    const summary = document.getElementById("hygiene-daily-tasks-summary");

    if (!container || !summary) return;

    const escapeHtml = value =>
        String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");

    function statusInfo(task) {
        if (task.display_status === "done") {
            return {
                label: "✓ Fait",
                className: "done"
            };
        }

        if (task.display_status === "late") {
            return {
                label: "En retard",
                className: "late"
            };
        }

        if (task.display_status === "skipped") {
            return {
                label: "Non effectué",
                className: "skipped"
            };
        }

        return {
            label: "À faire",
            className: "pending"
        };
    }

    function formatTime(value) {
        return String(value || "").slice(0, 5);
    }

    function render(tasks) {
        if (!tasks.length) {
            summary.textContent = "Aucun relevé planifié aujourd’hui.";
            container.innerHTML =
                "<p>Aucune tâche HACCP pour aujourd’hui.</p>";
            return;
        }

        const done = tasks.filter(
            task => task.display_status === "done"
        ).length;

        const late = tasks.filter(
            task => task.display_status === "late"
        ).length;

        const pending = tasks.filter(
            task => task.display_status === "pending"
        ).length;

        summary.textContent =
            `${done}/${tasks.length} réalisés` +
            (pending ? ` · ${pending} à faire` : "") +
            (late ? ` · ${late} en retard` : "");

        const groups = new Map();

        for (const task of tasks) {
            const time = formatTime(task.scheduled_time);

            if (!groups.has(time)) {
                groups.set(time, []);
            }

            groups.get(time).push(task);
        }

        container.innerHTML = [...groups.entries()]
            .map(([time, group]) => `
                <div class="haccp-task-group">
                    <h3>${escapeHtml(time)}</h3>

                    <div class="haccp-task-list">
                        ${group.map(task => {
                            const status = statusInfo(task);

                            const temperature =
                                task.temperature != null
                                    ? ` · ${escapeHtml(task.temperature)} °C`
                                    : "";

                            const photo =
                                task.evidence_path
                                    ? " · 📷"
                                    : "";

                            return `
                                <button
                                    type="button"
                                    class="haccp-task haccp-task-${status.className}"
                                    data-task-id="${escapeHtml(task.id)}"
                                    data-equipment-id="${escapeHtml(task.hygiene_expert_equipment_id)}"
                                    data-scheduled-date="${escapeHtml(task.scheduled_date)}"
                                    data-scheduled-time="${escapeHtml(task.scheduled_time)}"
                                >
                                    <span class="haccp-task-title">
                                        ${escapeHtml(task.title.replace("Relevé température — ", ""))}
                                    </span>

                                    <span class="haccp-task-status">
                                        ${status.label}${temperature}${photo}
                                    </span>
                                </button>
                            `;
                        }).join("")}
                    </div>
                </div>
            `)
            .join("");
    }

    async function loadTasks() {
        try {
            const response = await fetch(
                "/.netlify/functions/admin-hygiene-tasks",
                {
                    credentials: "same-origin",
                    cache: "no-store"
                }
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(
                    data?.error || "Impossible de charger les tâches."
                );
            }

            render(Array.isArray(data.tasks) ? data.tasks : []);

        } catch (error) {
            summary.textContent = "Tâches indisponibles.";
            container.innerHTML =
                `<p>${escapeHtml(error?.message || "Erreur de chargement.")}</p>`;
        }
    }

    container.addEventListener("click", event => {
        const task = event.target.closest(".haccp-task");

        if (!task) return;

        const temperatureForm =
            document.getElementById("hygiene-temperature-form");

        const equipment =
            document.getElementById("hygiene-temperature-equipment");

        const recordedAt =
            document.getElementById("hygiene-temperature-date");

        if (temperatureForm) {
            temperatureForm.dataset.taskId =
                task.dataset.taskId || "";
        }

        if (equipment) {
            equipment.value =
                task.dataset.equipmentId || "";
        }

        /*
         * L'heure planifiée appartient à la tâche.
         * recordedAt doit rester l'heure réelle du relevé.
         */
        if (recordedAt && !recordedAt.value) {
            const now = new Date();
            const local = new Date(
                now.getTime() -
                now.getTimezoneOffset() * 60000
            );

            recordedAt.value =
                local.toISOString().slice(0, 16);
        }

        document
            .getElementById("temperature-entry-panel")
            ?.scrollIntoView({
                behavior: "smooth",
                block: "start"
            });
    });

    window.HygieneTasks = {
        reload: loadTasks
    };

    loadTasks();
})();

/* =========================================================
   TÂCHES NETTOYAGE — HYGIÈNE EXPERT
   Lecture seule : aucune validation automatique.
========================================================= */

(() => {
    const summary =
        document.getElementById("hygiene-cleaning-tasks-summary");

    const dailyContainer =
        document.getElementById("hygiene-cleaning-daily");

    const weeklyContainer =
        document.getElementById("hygiene-cleaning-weekly");

    if (!summary || !dailyContainer || !weeklyContainer) {
        return;
    }

    function escapeCleaningHtml(value) {
        return String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    function periodLabel(periods) {
        if (!Array.isArray(periods) || !periods.length) {
            return "";
        }

        return periods.join(" · ");
    }

    function renderTask(task, weekly = false) {
        const periods = periodLabel(task.periods);

        const meta = [
            task.zone,
            periods,
            weekly ? "À faire cette semaine" : null
        ]
            .filter(Boolean)
            .map(escapeCleaningHtml)
            .join(" · ");

        return `
            <div class="haccp-task haccp-task-pending cleaning-task"
                 data-cleaning-surface-id="${escapeCleaningHtml(task.cleaning_surface_id)}"
                 data-frequency-id="${escapeCleaningHtml(task.frequency_id)}">

                <span class="haccp-task-title">
                    ${escapeCleaningHtml(task.title)}
                </span>

                <span class="haccp-task-status">
                    ${meta || "À faire"}
                </span>
            </div>
        `;
    }

    function render(data) {
        const allTasks =
            Array.isArray(data.tasks) ? data.tasks : [];

        const dailyTasks = allTasks.filter(
            task => !task.weekly_without_date
        );

        const weeklyTasks = allTasks.filter(
            task => task.weekly_without_date
        );

        summary.textContent =
            `${dailyTasks.length} nettoyage${dailyTasks.length > 1 ? "s" : ""} prévu${dailyTasks.length > 1 ? "s" : ""} aujourd’hui` +
            (weeklyTasks.length
                ? ` · ${weeklyTasks.length} tâche${weeklyTasks.length > 1 ? "s" : ""} à faire cette semaine`
                : "");

        if (dailyTasks.length) {
            dailyContainer.innerHTML =
                dailyTasks
                    .map(task => renderTask(task, false))
                    .join("");
        } else {
            dailyContainer.innerHTML =
                "<p>Aucun nettoyage planifié aujourd’hui.</p>";
        }

        if (weeklyTasks.length) {
            weeklyContainer.innerHTML =
                weeklyTasks
                    .map(task => renderTask(task, true))
                    .join("");
        } else {
            weeklyContainer.innerHTML =
                "<p>Aucun nettoyage hebdomadaire en attente.</p>";
        }
    }

    async function loadCleaningTasks() {
        try {
            const response = await fetch(
                "/.netlify/functions/admin-hygiene-cleaning-tasks",
                {
                    credentials: "same-origin",
                    cache: "no-store"
                }
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(
                    data?.error ||
                    "Impossible de charger le planning de nettoyage."
                );
            }

            render(data);

        } catch (error) {
            summary.textContent =
                "Planning de nettoyage indisponible.";

            dailyContainer.innerHTML =
                `<p>${escapeCleaningHtml(
                    error?.message || "Erreur de chargement."
                )}</p>`;

            weeklyContainer.innerHTML = "";
        }
    }

    window.HygieneCleaningTasks = {
        reload: loadCleaningTasks
    };

    loadCleaningTasks();
})();
