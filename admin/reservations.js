let currentScope = "upcoming";
let currentReservations = [];

const $ = (id) => document.getElementById(id);

const escapeHtml = (value) =>
    String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");

const statusLabels = {
    confirmed: "Confirmée",
    seated: "Installée",
    completed: "Terminée",
    cancelled: "Annulée",
    no_show: "Absent"
};

const sourceLabels = {
    website: "Site internet",
    phone: "Téléphone",
    walk_in: "Sur place",
    admin: "Ajout manuel"
};

function authHeaders(extra = {}) {
    return { ...extra };
}

function formatDate(value) {
    if (!value) return "";

    const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);

    return new Intl.DateTimeFormat("fr-FR", {
        weekday: "long",
        day: "2-digit",
        month: "long",
        year: "numeric"
    }).format(date);
}

function formatTime(value) {
    return String(value || "").slice(0, 5).replace(":", "h");
}

function dateInputValue(value) {
    return String(value || "").slice(0, 10);
}

function timeInputValue(value) {
    return String(value || "").slice(0, 5);
}

async function loadReservations() {
    $("reservations-loading").style.display = "block";
    $("reservations-empty").style.display = "none";
    $("reservations-list").innerHTML = "";

    try {
        const response = await fetch(
            `/.netlify/functions/admin-reservations?scope=${currentScope}`,
            {
                headers: authHeaders(),
                credentials: "same-origin",
                cache: "no-store"
            }
        );

        const data = await response.json();

        if (!response.ok) {
            throw new Error(
                data.error || "Impossible de charger les réservations."
            );
        }

        currentReservations = data.reservations || [];

        $("reservations-dashboard").style.display = "block";

        renderReservations();

    } catch (error) {
        $("reservations-loading").style.display = "none";

        $("reservations-list").innerHTML =
            `<div class="orders-error">${escapeHtml(error.message)}</div>`;
    }
}

function filteredReservations() {
    const query =
        ($("reservation-search")?.value || "")
            .trim()
            .toLowerCase();

    if (!query) {
        return currentReservations;
    }

    return currentReservations.filter((reservation) => {
        const searchable = [
            reservation.reservation_ref,
            reservation.customer_name,
            reservation.customer_phone,
            reservation.customer_email,
            reservation.notes,
            reservation.allergies
        ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();

        return searchable.includes(query);
    });
}

function renderReservations() {
    $("reservations-loading").style.display = "none";

    const reservations = filteredReservations();

    $("reservations-count").textContent = reservations.length;

    $("reservations-guests").textContent = reservations
        .filter((reservation) =>
            !["cancelled", "no_show"].includes(reservation.status)
        )
        .reduce(
            (sum, reservation) =>
                sum + (Number(reservation.party_size) || 0),
            0
        );

    $("reservations-confirmed").textContent =
        reservations.filter(
            (reservation) => reservation.status === "confirmed"
        ).length;

    $("reservations-allergies").textContent =
        reservations.filter(
            (reservation) =>
                String(reservation.allergies || "").trim()
        ).length;

    if (!reservations.length) {
        $("reservations-empty").style.display = "block";
        $("reservations-list").innerHTML = "";
        return;
    }

    $("reservations-empty").style.display = "none";

    $("reservations-list").innerHTML =
        reservations.map(reservationCard).join("");
}

function reservationCard(reservation) {
    const status = reservation.status || "confirmed";

    const statusOptions = [
        ["confirmed", "Confirmée"],
        ["seated", "Installée"],
        ["completed", "Terminée"],
        ["cancelled", "Annulée"],
        ["no_show", "Absent"]
    ]
        .map(([value, label]) => `
            <option
                value="${value}"
                ${value === status ? "selected" : ""}>
                ${label}
            </option>
        `)
        .join("");

    const phone = String(reservation.customer_phone || "");
    const phoneHref = phone.replace(/[^\d+]/g, "");

    const email = String(reservation.customer_email || "");

    const allergies = reservation.allergies
        ? `
            <div class="order-warning">
                <strong>Allergies :</strong>
                ${escapeHtml(reservation.allergies)}
            </div>
        `
        : "";

    const notes = reservation.notes
        ? `
            <div class="order-note">
                <strong>Commentaire :</strong>
                ${escapeHtml(reservation.notes)}
            </div>
        `
        : "";

    return `
        <article class="order-card reservation-card">

            <div class="order-card-header">

                <div>
                    <div class="order-reference">
                        ${escapeHtml(
                            formatTime(reservation.reservation_time)
                        )}
                        ·
                        ${escapeHtml(reservation.party_size)}
                        ${Number(reservation.party_size) > 1
                            ? "personnes"
                            : "personne"}
                    </div>

                    <div class="order-service">
                        ${escapeHtml(
                            formatDate(reservation.reservation_date)
                        )}
                        ·
                        ${escapeHtml(
                            reservation.reservation_ref || ""
                        )}
                    </div>
                </div>

                <div class="order-header-right">

                    <span class="order-mode">
                        ${escapeHtml(
                            sourceLabels[reservation.source] ||
                            reservation.source ||
                            "Réservation"
                        )}
                    </span>

                    <span class="order-status status-${escapeHtml(status)}">
                        ${escapeHtml(statusLabels[status] || status)}
                    </span>

                </div>

            </div>

            <div class="reservation-card-body">

                <div class="order-customer">

                    <h3>
                        ${escapeHtml(
                            reservation.customer_name || "Client"
                        )}
                    </h3>

                    ${phone
                        ? `<div>${escapeHtml(phone)}</div>`
                        : ""
                    }

                    ${email
                        ? `<div>${escapeHtml(email)}</div>`
                        : ""
                    }

                    <div class="order-contact-actions">

                        ${phone
                            ? `
                                <a
                                    class="secondary-button"
                                    href="tel:${escapeHtml(phoneHref)}">
                                    Appeler
                                </a>
                            `
                            : ""
                        }

                        ${email
                            ? `
                                <a
                                    class="secondary-button"
                                    href="mailto:${escapeHtml(email)}">
                                    E-mail
                                </a>
                            `
                            : ""
                        }

                    </div>

                    ${allergies}
                    ${notes}

                </div>

                <div class="reservation-admin-actions">

                    <label>
                        Statut
                        <select
                            onchange="changeReservationStatus(
                                '${reservation.id}',
                                this.value
                            )">
                            ${statusOptions}
                        </select>
                    </label>

                    <button
                        class="secondary-button"
                        type="button"
                        onclick="editReservation('${reservation.id}')">
                        Modifier
                    </button>

                </div>

            </div>

        </article>
    `;
}

async function changeReservationStatus(reservationId, status) {
    try {
        const response = await fetch(
            "/.netlify/functions/admin-reservations",
            {
                method: "POST",
                credentials: "same-origin",
                headers: authHeaders({
                    "Content-Type": "application/json"
                }),
                body: JSON.stringify({
                    action: "status",
                    reservation_id: reservationId,
                    status
                })
            }
        );

        const data = await response.json();

        if (!response.ok) {
            throw new Error(
                data.error || "Impossible de modifier le statut."
            );
        }

        await loadReservations();

    } catch (error) {
        alert(error.message);
        await loadReservations();
    }
}

function resetReservationForm() {
    $("reservation-form").reset();
    $("reservation-id").value = "";
    $("reservation-source").value = "phone";
    $("reservation-party-size").value = "2";
    $("reservation-form-error").textContent = "";
    $("reservation-modal-title").textContent =
        "Nouvelle réservation";
}

function openNewReservation() {
    resetReservationForm();

    const today = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Europe/Paris",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).format(new Date());

    $("reservation-date").value = today;

    $("reservation-modal").style.display = "flex";
}

function editReservation(reservationId) {
    const reservation = currentReservations.find(
        (item) => String(item.id) === String(reservationId)
    );

    if (!reservation) {
        alert("Réservation introuvable.");
        return;
    }

    resetReservationForm();

    $("reservation-modal-title").textContent =
        "Modifier la réservation";

    $("reservation-id").value = reservation.id;
    $("reservation-date").value =
        dateInputValue(reservation.reservation_date);
    $("reservation-time").value =
        timeInputValue(reservation.reservation_time);
    $("reservation-party-size").value =
        reservation.party_size || 1;
    $("reservation-name").value =
        reservation.customer_name || "";
    $("reservation-phone").value =
        reservation.customer_phone || "";
    $("reservation-email").value =
        reservation.customer_email || "";
    $("reservation-allergies").value =
        reservation.allergies || "";
    $("reservation-notes").value =
        reservation.notes || "";

    const source = reservation.source || "admin";

    $("reservation-source").value =
        ["phone", "walk_in", "admin"].includes(source)
            ? source
            : "admin";

    $("reservation-modal").style.display = "flex";
}

function closeReservationModal() {
    $("reservation-modal").style.display = "none";
}

async function saveReservation(event) {
    event.preventDefault();

    const reservationId = $("reservation-id").value.trim();
    const button = $("save-reservation");

    const payload = {
        action: reservationId ? "update" : "create",
        reservation_id: reservationId || undefined,
        date: $("reservation-date").value,
        time: $("reservation-time").value,
        party_size: Number.parseInt(
            $("reservation-party-size").value,
            10
        ),
        name: $("reservation-name").value.trim(),
        phone: $("reservation-phone").value.trim(),
        email: $("reservation-email").value.trim(),
        allergies: $("reservation-allergies").value.trim(),
        notes: $("reservation-notes").value.trim(),
        source: $("reservation-source").value
    };

    $("reservation-form-error").textContent = "";
    button.disabled = true;
    button.textContent = "Enregistrement…";

    try {
        const response = await fetch(
            "/.netlify/functions/admin-reservations",
            {
                method: "POST",
                credentials: "same-origin",
                headers: authHeaders({
                    "Content-Type": "application/json"
                }),
                body: JSON.stringify(payload)
            }
        );

        const data = await response.json();

        if (!response.ok) {
            throw new Error(
                data.error ||
                "Impossible d'enregistrer la réservation."
            );
        }

        closeReservationModal();
        await loadReservations();

    } catch (error) {
        $("reservation-form-error").textContent =
            error.message;
    } finally {
        button.disabled = false;
        button.textContent = "Enregistrer";
    }
}





document.querySelectorAll(".order-tab").forEach((button) => {
    button.addEventListener("click", () => {
        document.querySelectorAll(".order-tab").forEach((tab) =>
            tab.classList.remove("active")
        );

        button.classList.add("active");
        currentScope = button.dataset.scope;

        loadReservations();
    });
});

$("reservation-search").addEventListener(
    "input",
    renderReservations
);

$("refresh-reservations").addEventListener(
    "click",
    loadReservations
);

$("new-reservation").addEventListener(
    "click",
    openNewReservation
);

$("close-reservation-modal").addEventListener(
    "click",
    closeReservationModal
);

$("cancel-reservation-form").addEventListener(
    "click",
    closeReservationModal
);

$("reservation-form").addEventListener(
    "submit",
    saveReservation
);

$("reservation-modal").addEventListener("click", (event) => {
    if (event.target === $("reservation-modal")) {
        closeReservationModal();
    }
});

document.addEventListener("keydown", (event) => {
    if (
        event.key === "Escape" &&
        $("reservation-modal").style.display !== "none"
    ) {
        closeReservationModal();
    }
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
            $("reservations-dashboard").style.display = "block";

            await loadReservations();
        }

    } catch (error) {
        console.error(
            "Session administrateur :",
            error
        );
    }
}

window.changeReservationStatus =
    changeReservationStatus;

window.editReservation =
    editReservation;

initialiseAdminSession();

/* ================================
   RÉGLAGES DES RÉSERVATIONS
================================ */

function settingsSlots(value) {
    return String(value || "")
        .split(",")
        .map((slot) => slot.trim())
        .filter(Boolean);
}

function fillReservationSettings(settings) {
    $("settings-enabled").checked =
        settings.enabled !== false;

    $("settings-capacity-lunch").value =
        settings.service_capacity?.lunch ?? 10;

    $("settings-capacity-dinner").value =
        settings.service_capacity?.dinner ?? 10;

    $("settings-min-party").value =
        settings.min_party_size ?? 1;

    $("settings-max-party").value =
        settings.max_party_size ?? 10;

    $("settings-advance-days").value =
        settings.advance_booking_days ?? 60;

    $("settings-minimum-notice").value =
        settings.minimum_notice_minutes ?? 60;

    $("settings-slots-lunch").value =
        (settings.slots?.lunch || []).join(", ");

    $("settings-slots-dinner").value =
        (settings.slots?.dinner || []).join(", ");

    document
        .querySelectorAll(".reservation-weekly-row")
        .forEach((row) => {
            const day = row.dataset.day;
            const services =
                Array.isArray(settings.weekly?.[day])
                    ? settings.weekly[day]
                    : [];

            row
                .querySelectorAll("[data-service]")
                .forEach((checkbox) => {
                    checkbox.checked =
                        services.includes(
                            checkbox.dataset.service
                        );
                });
        });

    $("settings-closed-dates").value =
        Array.isArray(settings.closed_dates)
            ? settings.closed_dates.join("\n")
            : "";
}

async function loadReservationSettings() {
    const response = await fetch(
        "/.netlify/functions/admin-reservation-settings",
        {
            credentials: "same-origin",
            headers: authHeaders(),
            cache: "no-store"
        }
    );

    const data = await response.json();

    if (!response.ok) {
        throw new Error(
            data.error ||
            "Impossible de charger les réglages."
        );
    }

    fillReservationSettings(data.settings || {});
}

async function openReservationSettings() {
    $("reservation-settings-error").textContent = "";
    $("reservation-settings-success").style.display =
        "none";

    $("reservation-settings-modal").style.display =
        "flex";

    try {
        await loadReservationSettings();
    } catch (error) {
        $("reservation-settings-error").textContent =
            error.message;
    }
}

function closeReservationSettings() {
    $("reservation-settings-modal").style.display =
        "none";
}

function collectWeeklySettings() {
    const weekly = {};

    document
        .querySelectorAll(".reservation-weekly-row")
        .forEach((row) => {
            weekly[row.dataset.day] = Array.from(
                row.querySelectorAll(
                    "[data-service]:checked"
                )
            ).map((checkbox) =>
                checkbox.dataset.service
            );
        });

    return weekly;
}

async function saveReservationSettings(event) {
    event.preventDefault();

    const button = $("save-reservation-settings");

    $("reservation-settings-error").textContent = "";
    $("reservation-settings-success").style.display =
        "none";

    const closedDates =
        $("settings-closed-dates")
            .value
            .split(/\n|,/)
            .map((date) => date.trim())
            .filter(Boolean);

    const settings = {
        enabled: $("settings-enabled").checked,

        service_capacity: {
            lunch: Number.parseInt(
                $("settings-capacity-lunch").value,
                10
            ),
            dinner: Number.parseInt(
                $("settings-capacity-dinner").value,
                10
            )
        },

        slots: {
            lunch: settingsSlots(
                $("settings-slots-lunch").value
            ),
            dinner: settingsSlots(
                $("settings-slots-dinner").value
            )
        },

        weekly: collectWeeklySettings(),

        closed_dates: closedDates,

        min_party_size: Number.parseInt(
            $("settings-min-party").value,
            10
        ),

        max_party_size: Number.parseInt(
            $("settings-max-party").value,
            10
        ),

        advance_booking_days: Number.parseInt(
            $("settings-advance-days").value,
            10
        ),

        minimum_notice_minutes: Number.parseInt(
            $("settings-minimum-notice").value,
            10
        )
    };

    button.disabled = true;
    button.textContent = "Enregistrement…";

    try {
        const response = await fetch(
            "/.netlify/functions/admin-reservation-settings",
            {
                method: "POST",
                credentials: "same-origin",
                headers: authHeaders({
                    "Content-Type": "application/json"
                }),
                body: JSON.stringify({ settings })
            }
        );

        const data = await response.json();

        if (!response.ok) {
            throw new Error(
                data.error ||
                "Impossible d'enregistrer les réglages."
            );
        }

        fillReservationSettings(data.settings);

        $("reservation-settings-success").style.display =
            "block";

    } catch (error) {
        $("reservation-settings-error").textContent =
            error.message;
    } finally {
        button.disabled = false;
        button.textContent =
            "Enregistrer les réglages";
    }
}

$("reservation-settings-button").addEventListener(
    "click",
    openReservationSettings
);

$("close-reservation-settings").addEventListener(
    "click",
    closeReservationSettings
);

$("cancel-reservation-settings").addEventListener(
    "click",
    closeReservationSettings
);

$("reservation-settings-form").addEventListener(
    "submit",
    saveReservationSettings
);

$("reservation-settings-modal").addEventListener(
    "click",
    (event) => {
        if (
            event.target ===
            $("reservation-settings-modal")
        ) {
            closeReservationSettings();
        }
    }
);

document.addEventListener("keydown", (event) => {
    if (
        event.key === "Escape" &&
        $("reservation-settings-modal").style.display !==
            "none"
    ) {
        closeReservationSettings();
    }
});
