const $ = (id) => document.getElementById(id);

let reservationSettings = null;
let selectedTime = "";
let reservationRequestToken = "";

function createRequestToken() {
    if (
        globalThis.crypto &&
        typeof globalThis.crypto.randomUUID === "function"
    ) {
        return crypto.randomUUID().replaceAll("-", "_");
    }

    return (
        Date.now().toString(36) +
        "_" +
        Math.random().toString(36).slice(2) +
        "_" +
        Math.random().toString(36).slice(2)
    );
}

function parisToday() {
    const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Europe/Paris",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).formatToParts(new Date());

    const values = Object.fromEntries(
        parts
            .filter(part => part.type !== "literal")
            .map(part => [part.type, part.value])
    );

    return `${values.year}-${values.month}-${values.day}`;
}

function addDays(dateString, days) {
    const date = new Date(`${dateString}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
}

function formatDate(dateString) {
    const date = new Date(`${dateString}T12:00:00Z`);

    return new Intl.DateTimeFormat("fr-FR", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "Europe/Paris"
    }).format(date);
}

function formatTime(value) {
    return String(value || "")
        .slice(0, 5)
        .replace(":", "h");
}

function showError(element, message) {
    element.textContent = message;
    element.style.display = "block";
}

function hideError(element) {
    element.textContent = "";
    element.style.display = "none";
}

async function loadSettings() {
    const response = await fetch(
        "/.netlify/functions/reservation-settings",
        {
            cache: "no-store"
        }
    );

    const data = await response.json();

    if (!response.ok) {
        throw new Error(
            data.error ||
            "Impossible de charger les réservations."
        );
    }

    reservationSettings = data;

    const minParty = Math.max(
        1,
        Number(data.min_party_size || 1)
    );

    const maxParty = Math.max(
        minParty,
        Number(data.max_party_size || 10)
    );

    const lunchCapacity = Math.max(
        1,
        Number(data.service_capacity?.lunch || 10)
    );

    const dinnerCapacity = Math.max(
        1,
        Number(data.service_capacity?.dinner || 10)
    );

    const noticeMinutes = Math.max(
        0,
        Number(data.minimum_notice_minutes || 60)
    );

    $("reservation-party-info").textContent =
        `De ${minParty} à ${maxParty} personnes.`;

    if (lunchCapacity === dinnerCapacity) {
        $("reservation-capacity-info").textContent =
            `La capacité est limitée à ${lunchCapacity} couverts par service.`;
    } else {
        $("reservation-capacity-info").textContent =
            `Capacité : ${lunchCapacity} couverts le midi et ${dinnerCapacity} le soir.`;
    }

    let noticeText;

    if (noticeMinutes === 0) {
        noticeText = "Aucun délai minimum.";
    } else if (noticeMinutes % 60 === 0) {
        const hours = noticeMinutes / 60;
        noticeText =
            hours === 1
                ? "1 heure avant votre arrivée."
                : `${hours} heures avant votre arrivée.`;
    } else if (noticeMinutes < 60) {
        noticeText =
            `${noticeMinutes} minutes avant votre arrivée.`;
    } else {
        const hours = Math.floor(noticeMinutes / 60);
        const minutes = noticeMinutes % 60;

        noticeText =
            `${hours} h ${String(minutes).padStart(2, "0")} avant votre arrivée.`;
    }

    $("reservation-notice-info").textContent = noticeText;

    const today = parisToday();
    const advanceDays = Math.max(
        1,
        Number(data.advance_booking_days || 60)
    );

    $("public-reservation-date").min = today;
    $("public-reservation-date").max =
        addDays(today, advanceDays);

    if (!$("public-reservation-date").value) {
        $("public-reservation-date").value = today;
    }
}

async function loadAvailability() {
    const date = $("public-reservation-date").value;
    const partySize = $("public-party-size").value;

    selectedTime = "";
    $("public-reservation-time").value = "";
    $("reservation-contact-section").style.display = "none";
    $("reservation-slots-section").style.display = "none";
    $("reservation-slots").innerHTML = "";

    hideError($("reservation-availability-error"));

    if (!date || !partySize) {
        return;
    }

    $("reservation-availability-loading").style.display =
        "block";

    try {
        const params = new URLSearchParams({
            date,
            party_size: partySize
        });

        const response = await fetch(
            `/.netlify/functions/reservation-availability?${params}`,
            {
                cache: "no-store"
            }
        );

        const data = await response.json();

        if (!response.ok) {
            throw new Error(
                data.error ||
                "Impossible de vérifier les disponibilités."
            );
        }

        renderAvailability(data);

    } catch (error) {
        showError(
            $("reservation-availability-error"),
            error.message
        );
    } finally {
        $("reservation-availability-loading").style.display =
            "none";
    }
}

function renderAvailability(data) {
    const container = $("reservation-slots");
    const services = Array.isArray(data.services)
        ? data.services
        : [];

    const availableServices = services.filter(
        service =>
            service.available &&
            Array.isArray(service.slots) &&
            service.slots.length
    );

    if (!availableServices.length) {
        let message =
            "Aucun créneau n'est disponible pour cette date.";

        if (data.reason === "past_date") {
            message = "Cette date est déjà passée.";
        }

        if (data.reason === "too_far") {
            message =
                "Cette date n'est pas encore ouverte à la réservation.";
        }

        if (data.reason === "closed") {
            message =
                "Le restaurant ne prend pas de réservation à cette date.";
        }

        if (data.reason === "party_too_large") {
            message =
                "Pour ce nombre de personnes, contactez-nous directement.";
        }

        showError(
            $("reservation-availability-error"),
            message
        );

        return;
    }

    const labels = {
        lunch: "Déjeuner",
        dinner: "Dîner"
    };

    container.innerHTML = availableServices
        .map(service => `
            <div class="reservation-service">
                <div class="reservation-service-heading">
                    <strong>
                        ${labels[service.service] || service.service}
                    </strong>
                    <span>
                        ${service.remaining}
                        ${Number(service.remaining) > 1
                            ? " places restantes"
                            : " place restante"}
                    </span>
                </div>

                <div class="reservation-service-slots">
                    ${service.slots
                        .map(time => `
                            <button
                                class="reservation-slot"
                                type="button"
                                data-time="${time}">
                                ${formatTime(time)}
                            </button>
                        `)
                        .join("")}
                </div>
            </div>
        `)
        .join("");

    $("reservation-slots-section").style.display = "block";

    container
        .querySelectorAll(".reservation-slot")
        .forEach(button => {
            button.addEventListener("click", () => {
                selectTime(button.dataset.time);
            });
        });
}

function selectTime(time) {
    selectedTime = time;
    $("public-reservation-time").value = time;

    document
        .querySelectorAll(".reservation-slot")
        .forEach(button => {
            button.classList.toggle(
                "selected",
                button.dataset.time === time
            );
        });

    $("reservation-contact-section").style.display = "block";

    updateSummary();

    setTimeout(() => {
        $("reservation-contact-section").scrollIntoView({
            behavior: "smooth",
            block: "start"
        });
    }, 50);
}

function updateSummary() {
    const date = $("public-reservation-date").value;
    const partySize =
        Number($("public-party-size").value || 0);

    if (!date || !selectedTime || !partySize) {
        $("reservation-summary").innerHTML = "";
        return;
    }

    $("reservation-summary").innerHTML = `
        <strong>Votre réservation</strong>
        <span>
            ${formatDate(date)} à
            ${formatTime(selectedTime)}
            · ${partySize}
            ${partySize > 1 ? "personnes" : "personne"}
        </span>
    `;
}

async function submitReservation(event) {
    event.preventDefault();

    hideError($("public-reservation-error"));

    if (!selectedTime) {
        showError(
            $("public-reservation-error"),
            "Choisissez d'abord un horaire."
        );
        return;
    }

    const button = $("public-reservation-submit");

    if (!reservationRequestToken) {
        reservationRequestToken = createRequestToken();
    }

    const payload = {
        request_token: reservationRequestToken,
        date: $("public-reservation-date").value,
        time: selectedTime,
        party_size: Number(
            $("public-party-size").value
        ),
        name: $("public-reservation-name").value.trim(),
        phone: $("public-reservation-phone").value.trim(),
        email: $("public-reservation-email").value.trim(),
        allergies:
            $("public-reservation-allergies").value.trim(),
        notes:
            $("public-reservation-notes").value.trim(),
        website:
            $("public-reservation-website").value.trim()
    };

    button.disabled = true;
    button.textContent = "Confirmation…";

    try {
        const response = await fetch(
            "/.netlify/functions/create-reservation",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(payload)
            }
        );

        const data = await response.json();

        if (!response.ok) {
            throw new Error(
                data.error ||
                "Impossible de confirmer la réservation."
            );
        }

        $("reservation-step-form").style.display = "none";
        $("reservation-success").style.display = "block";

        $("reservation-success-text").textContent =
            `${payload.name}, votre table pour ` +
            `${payload.party_size} ` +
            `${payload.party_size > 1
                ? "personnes"
                : "personne"} ` +
            `est réservée le ${formatDate(payload.date)} ` +
            `à ${formatTime(payload.time)}.`;

        if (data.reservation_ref) {
            $("reservation-success-reference").textContent =
                `Référence : ${data.reservation_ref}`;
        }

        $("reservation-success-email").textContent =
            data.email_sent
                ? "Un e-mail de confirmation vient de vous être envoyé."
                : "Votre réservation est bien enregistrée. L’e-mail de confirmation n’a pas pu être envoyé.";

        window.scrollTo({
            top: 0,
            behavior: "smooth"
        });

    } catch (error) {
        showError(
            $("public-reservation-error"),
            error.message
        );

        await loadAvailability();

    } finally {
        button.disabled = false;
        button.textContent =
            "Confirmer la réservation";
    }
}

async function initialiseReservations() {
    try {
        await loadSettings();
        await loadAvailability();
    } catch (error) {
        showError(
            $("reservation-availability-error"),
            error.message
        );
    }
}

$("public-reservation-date").addEventListener(
    "change",
    loadAvailability
);

$("public-party-size").addEventListener(
    "change",
    loadAvailability
);

$("public-reservation-form").addEventListener(
    "submit",
    submitReservation
);

initialiseReservations();
