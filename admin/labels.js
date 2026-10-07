const $ = id => document.getElementById(id);

let mode = "internal";
let labelProducts = [];

function pad(n) {
    return String(n).padStart(2, "0");
}

function localDateTimeValue(date = new Date()) {
    return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatDateTime(value) {
    if (!value) return "—";

    const d = new Date(value);

    return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatDate(value) {
    if (!value) return "À DÉFINIR";

    const [y,m,d] = value.split("-");

    return `${d}/${m}/${y}`;
}

function selectedProduct() {
    return labelProducts.find(
        product => String(product.id) === String($("product").value)
    );
}

function productName() {
    const custom = $("customProduct").value.trim();

    if (custom) return custom;

    const product = selectedProduct();

    return product?.name || "PRÉPARATION";
}

function createLot() {
    const value = $("production").value;

    if (!value) return "";

    const d = new Date(value);

    return (
        pad(d.getDate()) +
        pad(d.getMonth()+1) +
        String(d.getFullYear()).slice(-2) +
        "-" +
        pad(d.getHours()) +
        pad(d.getMinutes())
    );
}

function calculateExpiry() {
    const production = $("production").value;
    const days = Number($("lifeDays").value);

    if (!production || !days) {
        $("expiry").value = "";
        return;
    }

    const d = new Date(production);

    d.setDate(d.getDate() + days);

    $("expiry").value =
        `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}

async function loadProducts() {
    $("product").innerHTML =
        `<option value="">Chargement des produits…</option>`;

    try {
        const response = await fetch(
            "/.netlify/functions/admin-products",
            {
                credentials: "same-origin"
            }
        );

        if (!response.ok) {
            throw new Error(
                `Erreur produits (${response.status})`
            );
        }

        const products = await response.json();

        labelProducts = (products || [])
            .filter(product => product.active === true)
            .sort((a,b) =>
                String(a.name || "").localeCompare(
                    String(b.name || ""),
                    "fr"
                )
            );

        $("product").innerHTML =
            `<option value="">— Choisir —</option>`;

        for (const product of labelProducts) {
            const option = document.createElement("option");

            option.value = product.id;
            option.textContent = product.name;

            $("product").appendChild(option);
        }

        if (!labelProducts.length) {
            $("status").textContent =
                "Aucun produit actif disponible.";
        }

    } catch (error) {
        console.error(error);

        $("product").innerHTML =
            `<option value="">— Produits indisponibles —</option>`;

        $("status").textContent =
            "⚠️ Impossible de charger les produits.";
    }
}

function loadSelectedProduct() {
    const product = selectedProduct();

    if (!product) {
        updatePreview();
        return;
    }

    $("customProduct").value = "";

    $("ingredients").value =
        product.ingredients || "";

    $("allergens").value =
        product.allergens || "";

    $("weight").value =
        product.net_weight || "";

    $("storage").value =
        product.storage_instructions ||
        "À conserver entre 0 °C et +4 °C";

    $("lifeDays").value =
        product.shelf_life_days == null
            ? ""
            : String(product.shelf_life_days);

    /*
      Si la durée enregistrée dépasse les options actuellement
      présentes dans le select, on ajoute automatiquement J+X.
    */
    if (
        product.shelf_life_days &&
        !$("lifeDays").querySelector(
            `option[value="${product.shelf_life_days}"]`
        )
    ) {
        const option = document.createElement("option");

        option.value = String(product.shelf_life_days);
        option.textContent = `J+${product.shelf_life_days}`;

        $("lifeDays").appendChild(option);

        $("lifeDays").value =
            String(product.shelf_life_days);
    }

    updatePreview();
}

function setMode(newMode) {
    mode = newMode;

    const sale = mode === "sale";

    $("internalMode").classList.toggle("active", !sale);
    $("saleMode").classList.toggle("active", sale);

    $("saleFields").classList.toggle("hidden", !sale);
    $("pSaleFields").classList.toggle("hidden", !sale);

    updatePreview();
}

function updatePreview() {
    calculateExpiry();

    $("lot").value = createLot();

    $("pProduct").textContent =
        productName().toUpperCase();

    $("pProduction").textContent =
        formatDateTime($("production").value);

    $("pExpiry").textContent =
        formatDate($("expiry").value);

    $("pStorage").textContent =
        $("storage").value || "—";

    $("pAllergens").textContent =
        $("allergens").value || "À COMPLÉTER";

    $("pLot").textContent =
        $("lot").value || "—";

    $("pIngredients").textContent =
        $("ingredients").value || "—";

    $("pWeight").textContent =
        $("weight").value || "—";

    $("lifeWarning").style.display =
        $("lifeDays").value ? "none" : "block";
}

$("internalMode").addEventListener(
    "click",
    () => setMode("internal")
);

$("saleMode").addEventListener(
    "click",
    () => setMode("sale")
);

$("product").addEventListener(
    "change",
    loadSelectedProduct
);

[
    "customProduct",
    "production",
    "lifeDays",
    "storage",
    "allergens",
    "ingredients",
    "weight"
].forEach(id => {
    $(id).addEventListener("input", updatePreview);
    $(id).addEventListener("change", updatePreview);
});

$("production").value = localDateTimeValue();

setMode("internal");
updatePreview();
loadProducts();
