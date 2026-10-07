(() => {
    const pickupEnabled = document.getElementById("pickup-enabled");
    const deliveryEnabled = document.getElementById("delivery-enabled");
    const saveButton = document.getElementById("save-order-settings");
    const status = document.getElementById("order-settings-status");
    const closedDateInput = document.getElementById("closed-date");
    const addClosedDateButton = document.getElementById("add-closed-date");
    const closedDatesList = document.getElementById("closed-dates-list");
    const maxOrdersPerSlot = document.getElementById("max-orders-per-slot");

    let closedDates = [];

    function message(text) {
        if (status) status.textContent = text;
    }

    function parseSlots(value) {
        return String(value || "")
            .split(",")
            .map(x => x.trim())
            .filter(Boolean);
    }

    function renderClosedDates() {
        if (!closedDatesList) return;

        if (!closedDates.length) {
            closedDatesList.innerHTML =
                '<p class="order-settings-empty">Aucune fermeture exceptionnelle.</p>';
            return;
        }

        closedDatesList.innerHTML = closedDates
            .slice()
            .sort()
            .map(date => `
                <div class="closed-date-item">
                    <span>${date.split("-").reverse().join("/")}</span>
                    <button type="button"
                            class="remove-closed-date"
                            data-date="${date}">
                        Supprimer
                    </button>
                </div>
            `)
            .join("");

        closedDatesList
            .querySelectorAll(".remove-closed-date")
            .forEach(button => {
                button.addEventListener("click", () => {
                    closedDates = closedDates.filter(
                        date => date !== button.dataset.date
                    );
                    renderClosedDates();
                });
            });
    }

    function fillForm(settings) {
        pickupEnabled.checked = settings.pickup_enabled !== false;
        deliveryEnabled.checked = settings.delivery_enabled !== false;

        if (maxOrdersPerSlot) {
            maxOrdersPerSlot.value = Math.max(
                1,
                Number(settings.max_orders_per_slot || 6)
            );
        }

        const weekly = settings.weekly || {};

        document.querySelectorAll(".schedule-row").forEach(row => {
            const day = row.dataset.day;
            const config = weekly[day] || {};

            row.querySelector(".pickup-slots").value =
                Array.isArray(config.pickup)
                    ? config.pickup.join(", ")
                    : "";

            row.querySelector(".delivery-slots").value =
                Array.isArray(config.delivery)
                    ? config.delivery.join(", ")
                    : "";
        });

        closedDates = Array.isArray(settings.closed_dates)
            ? [...settings.closed_dates]
            : [];

        renderClosedDates();
    }

    function collectSettings() {
        const weekly = {};

        document.querySelectorAll(".schedule-row").forEach(row => {
            const day = row.dataset.day;

            weekly[day] = {
                pickup: parseSlots(
                    row.querySelector(".pickup-slots").value
                ),
                delivery: parseSlots(
                    row.querySelector(".delivery-slots").value
                )
            };
        });

        return {
            pickup_enabled: pickupEnabled.checked,
            delivery_enabled: deliveryEnabled.checked,
            max_orders_per_slot: Math.max(
                1,
                Math.min(99, Number(maxOrdersPerSlot?.value || 6))
            ),
            weekly,
            closed_dates: [...closedDates].sort()
        };
    }

    async function loadSettings() {
        message("Chargement…");

        try {
            const response = await fetch(
                "/.netlify/functions/admin-order-settings",
                {
                    method: "GET",
                    credentials: "same-origin",
                    cache: "no-store"
                }
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(
                    data.error || "Impossible de charger les créneaux."
                );
            }

            fillForm(data.settings || {});
            message("");
        } catch (error) {
            console.error("Chargement créneaux :", error);
            message(error.message || "Impossible de charger les créneaux.");
        }
    }

    async function saveSettings() {
        saveButton.disabled = true;
        message("Enregistrement…");

        try {
            const response = await fetch(
                "/.netlify/functions/admin-order-settings",
                {
                    method: "POST",
                    credentials: "same-origin",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        settings: collectSettings()
                    })
                }
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(
                    data.error || "Impossible d'enregistrer les créneaux."
                );
            }

            fillForm(data.settings || {});
            message("Modifications enregistrées.");
        } catch (error) {
            console.error("Enregistrement créneaux :", error);
            message(error.message || "Impossible d'enregistrer les créneaux.");
        } finally {
            saveButton.disabled = false;
        }
    }

    addClosedDateButton.addEventListener("click", () => {
        const date = closedDateInput.value;

        if (!date) {
            message("Choisissez une date.");
            return;
        }

        if (!closedDates.includes(date)) {
            closedDates.push(date);
        }

        closedDateInput.value = "";
        renderClosedDates();
        message("");
    });

    saveButton.addEventListener("click", saveSettings);

    loadSettings();
})();
