(() => {
    const API = "/.netlify/functions";

    const $ = id => document.getElementById(id);

    const authMessage = $("appearance-auth-message");
    const editor = $("appearance-editor");
    const status = $("appearance-status");
    const message = $("appearance-message");
    const saveButton = $("save-appearance");
    const imageInput = $("hero-image");
    const imagePreview = $("hero-image-preview");
    const storyImageInput = $("story-image");
    const storyImagePreview = $("story-image-preview");

    let currentSettings = {};
    let heroImageUrl = "";
    let storyImageUrl = "";

    function setMessage(text, isError = false) {
        if (!message) return;
        message.textContent = text || "";
        message.dataset.type = isError ? "error" : "success";
    }

    function setStatus(text) {
        if (status) status.textContent = text;
    }

    async function fetchJSON(url, options = {}) {
        const response = await fetch(url, {
            credentials: "same-origin",
            cache: "no-store",
            ...options
        });

        let data = {};

        try {
            data = await response.json();
        } catch {}

        if (!response.ok) {
            throw new Error(
                data?.error || `Erreur HTTP ${response.status}`
            );
        }

        return data;
    }

    const defaultSectionOrder = [
        "univers",
        "today",
        "best",
        "story",
        "gift",
        "loyalty"
    ];

    function getSectionOrder() {
        const container = $("appearance-section-order");
        if (!container) return [...defaultSectionOrder];

        return Array.from(
            container.querySelectorAll(".appearance-section-row")
        )
            .map(row => row.dataset.section)
            .filter(id => defaultSectionOrder.includes(id));
    }

    function applySectionOrder(order) {
        const container = $("appearance-section-order");
        if (!container) return;

        const requested = Array.isArray(order)
            ? order.filter(id => defaultSectionOrder.includes(id))
            : [];

        const finalOrder = [
            ...new Set([
                ...requested,
                ...defaultSectionOrder
            ])
        ];

        finalOrder.forEach(id => {
            const row = container.querySelector(
                `.appearance-section-row[data-section="${id}"]`
            );

            if (row) container.appendChild(row);
        });

        updateMoveButtons();
    }

    function updateMoveButtons() {
        const container = $("appearance-section-order");
        if (!container) return;

        const rows = Array.from(
            container.querySelectorAll(".appearance-section-row")
        );

        rows.forEach((row, index) => {
            const up = row.querySelector(".appearance-move-up");
            const down = row.querySelector(".appearance-move-down");

            if (up) up.disabled = index === 0;
            if (down) down.disabled = index === rows.length - 1;
        });
    }

    function moveSection(row, direction) {
        if (!row?.parentElement) return;

        if (direction === "up") {
            const previous = row.previousElementSibling;
            if (previous) {
                row.parentElement.insertBefore(row, previous);
            }
        }

        if (direction === "down") {
            const next = row.nextElementSibling;
            if (next) {
                row.parentElement.insertBefore(next, row);
            }
        }

        updateMoveButtons();
        setStatus("Modification non enregistrée");
    }

    const universeTileIds = [
        "food",
        "grocery",
        "drinks",
        "minargent",
        "gifts",
        "card"
    ];

    const universeImageUrls = {};

    function renderUniverseImagePreview(id) {
        const preview = $("universe-" + id + "-image-preview");
        if (!preview) return;

        const url = universeImageUrls[id] || "";

        if (url) {
            preview.innerHTML = "";

            const img = document.createElement("img");
            img.src = url;
            img.alt = "Aperçu de l'image";

            preview.appendChild(img);
        } else {
            preview.textContent = "Aucune photo personnalisée";
        }
    }

    function applySettings(settings = {}) {
        currentSettings = settings || {};

        const promo = settings.promo || {};
        const hero = settings.hero || {};
        const sections = settings.sections || {};
        const universeStyle = settings.universeStyle || {};

        $("universe-layout").value = universeStyle.layout || "3";
        $("universe-height").value = universeStyle.height || "normal";
        $("universe-radius").value = universeStyle.radius || "normal";
        $("universe-overlay").value = universeStyle.overlay || "normal";
        $("universe-position").value = universeStyle.position || "center";

        $("promo-text").value = promo.text || "";
        $("promo-visible").checked = promo.visible !== false;

        $("hero-kicker").value = hero.kicker || "";
        $("hero-title").value = hero.title || "";
        $("hero-text").value = hero.text || "";
        $("hero-button").value = hero.button || "";

        heroImageUrl = hero.image || "";

        if (imagePreview) {
            if (heroImageUrl) {
                imagePreview.innerHTML = "";

                const img = document.createElement("img");
                img.src = heroImageUrl;
                img.alt = "Aperçu de l'image principale";

                imagePreview.appendChild(img);
            } else {
                imagePreview.textContent =
                    "Aucune image personnalisée";
            }
        }

        $("section-univers").checked = sections.univers !== false;
        $("section-today").checked = sections.today !== false;
        $("section-best").checked = sections.best !== false;
        $("section-story").checked = sections.story !== false;
        $("section-gift").checked = sections.gift !== false;
        $("section-loyalty").checked = sections.loyalty !== false;

        const content = settings.content || {};
        const univers = content.univers || {};
        const today = content.today || {};
        const best = content.best || {};
        const story = content.story || {};
        const gift = content.gift || {};
        const loyalty = content.loyalty || {};

        $("univers-kicker").value = univers.kicker || "";
        $("univers-title").value = univers.title || "";

        $("today-kicker").value = today.kicker || "";
        $("today-title").value = today.title || "";
        $("today-text").value = today.text || "";

        $("best-kicker").value = best.kicker || "";
        $("best-title").value = best.title || "";
        $("best-text").value = best.text || "";

        $("story-kicker").value = story.kicker || "";
        $("story-title").value = story.title || "";
        $("story-text").value = story.text || "";
        $("story-button").value = story.button || "";

        storyImageUrl = story.image || "";

        if (storyImagePreview) {
            if (storyImageUrl) {
                storyImagePreview.innerHTML = "";

                const img = document.createElement("img");
                img.src = storyImageUrl;
                img.alt = "Aperçu de la photo Minargent";

                storyImagePreview.appendChild(img);
            } else {
                storyImagePreview.textContent =
                    "Aucune photo personnalisée";
            }
        }

        $("gift-kicker").value = gift.kicker || "";
        $("gift-title").value = gift.title || "";
        $("gift-text").value = gift.text || "";
        $("gift-button").value = gift.button || "";

        $("loyalty-kicker").value = loyalty.kicker || "";
        $("loyalty-title").value = loyalty.title || "";
        $("loyalty-text").value = loyalty.text || "";
        $("loyalty-button").value = loyalty.button || "";

        const universeTiles = settings.universeTiles || {};

        for (const id of universeTileIds) {
            const tile = universeTiles[id] || {};

            $("universe-" + id + "-kicker").value = tile.kicker || "";
            $("universe-" + id + "-title").value = tile.title || "";
            $("universe-" + id + "-text").value = tile.text || "";
            $("universe-" + id + "-button").value = tile.button || "";

            universeImageUrls[id] = tile.image || "";
            renderUniverseImagePreview(id);
        }

        applySectionOrder(settings.order);
    }

    function collectSettings() {
        return {
            ...currentSettings,

            promo: {
                ...(currentSettings.promo || {}),
                text: $("promo-text").value.trim(),
                visible: $("promo-visible").checked
            },

            hero: {
                ...(currentSettings.hero || {}),
                kicker: $("hero-kicker").value.trim(),
                title: $("hero-title").value.trim(),
                text: $("hero-text").value.trim(),
                button: $("hero-button").value.trim(),
                image: heroImageUrl
            },

            sections: {
                ...(currentSettings.sections || {}),
                univers: $("section-univers").checked,
                today: $("section-today").checked,
                best: $("section-best").checked,
                story: $("section-story").checked,
                gift: $("section-gift").checked,
                loyalty: $("section-loyalty").checked
            },

            order: getSectionOrder(),

            universeStyle: {
                ...(currentSettings.universeStyle || {}),
                layout: $("universe-layout").value,
                height: $("universe-height").value,
                radius: $("universe-radius").value,
                overlay: $("universe-overlay").value,
                position: $("universe-position").value
            },

            universeTiles: Object.fromEntries(
                universeTileIds.map(id => [
                    id,
                    {
                        ...(currentSettings.universeTiles?.[id] || {}),
                        kicker: $("universe-" + id + "-kicker").value.trim(),
                        title: $("universe-" + id + "-title").value.trim(),
                        text: $("universe-" + id + "-text").value.trim(),
                        button: $("universe-" + id + "-button").value.trim(),
                        image: universeImageUrls[id] || ""
                    }
                ])
            ),

            content: {
                ...(currentSettings.content || {}),

                univers: {
                    ...(currentSettings.content?.univers || {}),
                    kicker: $("univers-kicker").value.trim(),
                    title: $("univers-title").value.trim()
                },

                today: {
                    ...(currentSettings.content?.today || {}),
                    kicker: $("today-kicker").value.trim(),
                    title: $("today-title").value.trim(),
                    text: $("today-text").value.trim()
                },

                best: {
                    ...(currentSettings.content?.best || {}),
                    kicker: $("best-kicker").value.trim(),
                    title: $("best-title").value.trim(),
                    text: $("best-text").value.trim()
                },

                story: {
                    ...(currentSettings.content?.story || {}),
                    kicker: $("story-kicker").value.trim(),
                    title: $("story-title").value.trim(),
                    text: $("story-text").value.trim(),
                    button: $("story-button").value.trim(),
                    image: storyImageUrl
                },

                gift: {
                    ...(currentSettings.content?.gift || {}),
                    kicker: $("gift-kicker").value.trim(),
                    title: $("gift-title").value.trim(),
                    text: $("gift-text").value.trim(),
                    button: $("gift-button").value.trim()
                },

                loyalty: {
                    ...(currentSettings.content?.loyalty || {}),
                    kicker: $("loyalty-kicker").value.trim(),
                    title: $("loyalty-title").value.trim(),
                    text: $("loyalty-text").value.trim(),
                    button: $("loyalty-button").value.trim()
                }
            }
        };
    }

    async function loadSettings() {
        setStatus("Chargement…");

        const data = await fetchJSON(
            `${API}/admin-site-settings`
        );

        const settings =
            data.settings ||
            data.site_settings ||
            data ||
            {};

        applySettings(settings);

        setStatus("Configuration chargée");
    }

    async function uploadImage(file) {
        if (!file) return "";

        setStatus("Envoi de l'image…");

        const formData = new FormData();
        formData.append("image", file);

        const response = await fetch(
            `${API}/upload-site-image`,
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
                `Erreur lors de l'envoi de l'image (${response.status})`
            );
        }

        const url =
            data.url ||
            data.publicUrl ||
            data.public_url;

        if (!url) {
            throw new Error(
                "L'adresse de l'image envoyée est absente."
            );
        }

        return url;
    }

    async function uploadPendingImages() {
        const heroFile = imageInput?.files?.[0];
        const storyFile = storyImageInput?.files?.[0];

        if (heroFile) {
            heroImageUrl = await uploadImage(heroFile);
        }

        if (storyFile) {
            storyImageUrl = await uploadImage(storyFile);
        }

        for (const id of universeTileIds) {
            const input = $("universe-" + id + "-image");
            const file = input?.files?.[0];

            if (file) {
                universeImageUrls[id] = await uploadImage(file);
            }
        }
    }

    async function saveSettings() {
        saveButton.disabled = true;
        setMessage("");
        setStatus("Enregistrement…");

        try {
            await uploadPendingImages();

            const settings = collectSettings();

            const data = await fetchJSON(
                `${API}/admin-site-settings`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({ settings })
                }
            );

            currentSettings =
                data.settings ||
                settings;

            applySettings(currentSettings);

            if (imageInput) imageInput.value = "";
            if (storyImageInput) storyImageInput.value = "";

            for (const id of universeTileIds) {
                const input = $("universe-" + id + "-image");
                if (input) input.value = "";
            }

            setStatus("Enregistré");
            setMessage(
                "Les modifications de la boutique ont été enregistrées."
            );
        } catch (error) {
            console.error("Enregistrement apparence :", error);
            setStatus("Erreur");
            setMessage(error.message, true);
        } finally {
            saveButton.disabled = false;
        }
    }

    for (const id of universeTileIds) {
        const input = $("universe-" + id + "-image");

        input?.addEventListener("change", () => {
            const file = input.files?.[0];
            if (!file) return;

            const preview = $("universe-" + id + "-image-preview");
            if (!preview) return;

            preview.innerHTML = "";

            const img = document.createElement("img");
            img.src = URL.createObjectURL(file);
            img.alt = "Aperçu de la nouvelle image";

            preview.appendChild(img);
        });
    }

    async function initialise() {
        try {
            const session = await window.AdminAuth.sessionStatus();

            if (!session.authenticated) {
                if (authMessage) {
                    authMessage.innerHTML =
                        "<h2>Accès administrateur requis</h2>" +
                        "<p>Reconnectez-vous depuis l'accueil de l'administration.</p>";
                }
                return;
            }

            if (authMessage) authMessage.hidden = true;
            editor.hidden = false;

            await loadSettings();
        } catch (error) {
            console.error("Initialisation Apparence :", error);

            if (authMessage) {
                authMessage.innerHTML = "";

                const title = document.createElement("h2");
                title.textContent = "Impossible d'ouvrir l'éditeur";

                const text = document.createElement("p");
                text.textContent = error.message;

                authMessage.append(title, text);
            }
        }
    }

    if (imageInput) {
        imageInput.addEventListener("change", () => {
            const file = imageInput.files?.[0];
            if (!file || !imagePreview) return;

            const localUrl = URL.createObjectURL(file);

            imagePreview.innerHTML = "";

            const img = document.createElement("img");
            img.src = localUrl;
            img.alt = "Nouvel aperçu";

            img.onload = () => URL.revokeObjectURL(localUrl);

            imagePreview.appendChild(img);
        });
    }

    if (storyImageInput) {
        storyImageInput.addEventListener("change", () => {
            const file = storyImageInput.files?.[0];
            if (!file || !storyImagePreview) return;

            const localUrl = URL.createObjectURL(file);

            storyImagePreview.innerHTML = "";

            const img = document.createElement("img");
            img.src = localUrl;
            img.alt = "Nouvel aperçu Minargent";

            img.onload = () => URL.revokeObjectURL(localUrl);

            storyImagePreview.appendChild(img);
            setStatus("Modification non enregistrée");
        });
    }

    const sectionOrder = $("appearance-section-order");

    sectionOrder?.addEventListener("click", event => {
        const up = event.target.closest(".appearance-move-up");
        const down = event.target.closest(".appearance-move-down");

        if (!up && !down) return;

        const row = event.target.closest(".appearance-section-row");
        if (!row) return;

        moveSection(row, up ? "up" : "down");
    });

    saveButton?.addEventListener("click", saveSettings);

    initialise();
})();
