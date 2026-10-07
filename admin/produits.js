let editingProductId = null;
let currentProducts = [];

const SUBCATEGORIES = {
    "À manger": [
        "Apéro & à partager",
        "Plats",
        "Pâtes fraîches",
        "Desserts"
    ],
    "Épicerie fine": [
        "Huiles & sauces",
        "Antipasti",
        "Biscuits & apéritif",
        "Pâtes"
    ],
    "Boissons & cave": [
        "Softs italiens",
        "Vins blancs",
        "Vins rouges",
        "Rosés & bulles"
    ],
    "Minargent": [
        "Punchs",
        "Rhums arrangés"
    ],
    "Coffrets & cadeaux": [
        "Coffrets gourmands",
        "Box apéro",
        "Box boissons",
        "Coffrets Minargent"
    ]
};

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function safeImageUrl(value) {
    const url = String(value ?? "").trim();

    if (!url) return "";

    try {
        const parsed = new URL(url, window.location.origin);

        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
            return "";
        }

        return escapeHtml(parsed.href);
    } catch {
        return "";
    }
}

function updateSubcategories(selected = "") {
    const category = document.getElementById("product-category").value;
    const select = document.getElementById("product-subcategory");
    const options = SUBCATEGORIES[category] || [];

    select.innerHTML =
        '<option value="">Choisir une sous-catégorie</option>' +
        options.map(sub =>
            `<option value="${sub}" ${sub === selected ? "selected" : ""}>${sub}</option>`
        ).join("");
}

async function loadProducts() {
    const table = document.getElementById("products-table");
    table.innerHTML = "Chargement des produits...";

    try {
        const response = await fetch("/.netlify/functions/admin-products", { credentials: "same-origin", cache: "no-store" });

        if (!response.ok) {
            throw new Error("Erreur " + response.status);
        }

        currentProducts = await response.json();

        document.getElementById("products-dashboard").style.display = "block";

        let html = `
            <div class="product-table-header">
                <div>Produit</div>
                <div>Catégorie</div>
                <div>Prix</div>
                <div>Stock</div>
                <div>Statut</div>
                <div>Actions</div>
            </div>
        `;

        currentProducts.forEach(product => {
            html += `
                <div class="product-table-row">

                    <div class="product-identity">
                        ${product.image
                            ? `<img src="${safeImageUrl(product.image)}" alt="${escapeHtml(product.name)}">`
                            : `<div class="product-image-placeholder">📷</div>`
                        }

                        <div>
                            <strong>${escapeHtml(product.name)}</strong>
                            ${product.featured === true
                                ? `<span class="featured-badge">⭐ Mis en avant</span>`
                                : ``
                            }
                        </div>
                    </div>

                    <div class="product-category-cell">
                        ${escapeHtml(product.category || "—")}
                    </div>

                    <div class="product-price-cell">
                        ${Number(product.price).toFixed(2)} €
                    </div>

                    <div class="product-stock-cell">
                        <strong>${
    product.stock === null || product.stock === undefined
        ? "Non suivi"
        : Number(product.stock) === 0
            ? "🔴 Rupture"
            : Number(product.stock) <= 5
                ? "⚠️ Stock faible — " + product.stock + " restant(s)"
                : product.stock
}</strong>
                    </div>

                    <div>
                        ${product.active !== false
                            ? `<span class="status-badge active">Actif</span>`
                            : `<span class="status-badge inactive">Inactif</span>`
                        }
                    </div>

                    <div class="product-actions">
                        <button onclick="editProduct('${product.id}')" class="edit-button">
                            Modifier
                        </button>
                        <button onclick="deleteProduct('${product.id}')" class="delete-button">
                            Supprimer
                        </button>
                    </div>

                </div>
            `;
        });

        table.innerHTML = html;
    } catch (error) {
        console.error(error);
        table.innerHTML = "Erreur de chargement : " + error.message;
    }
}

function resetForm() {
    editingProductId = null;

    document.getElementById("product-name").value = "";
    document.getElementById("product-category").value = "";
    updateSubcategories();
    document.getElementById("product-price").value = "";
    document.getElementById("product-description").value = "";
    document.getElementById("product-stock").value = "";
    document.getElementById("product-active").checked = true;
    document.getElementById("product-featured").checked = false;
    document.getElementById("product-alcohol").checked = false;

    document.getElementById("product-label-enabled").checked = false;
    document.getElementById("product-ingredients").value = "";
    document.getElementById("product-allergens").value = "";
    document.getElementById("product-net-weight").value = "";
    document.getElementById("product-shelf-life").value = "";
    document.getElementById("product-storage").value =
        "À conserver entre 0 °C et +4 °C";

    document.getElementById("product-image").value = "";
    showImagePreview("");

    document.querySelector("#product-form h2").textContent = "Nouveau produit";
    document.getElementById("save-product").textContent = "Enregistrer";
}

function showImagePreview(src) {
    const preview = document.getElementById("product-image-preview");

    if (!src) {
        preview.innerHTML = "";
        preview.style.display = "none";
        return;
    }

    preview.innerHTML = `<img src="${src}" alt="Aperçu du produit" style="width:100%;max-height:220px;object-fit:cover;border-radius:16px;">`;
    preview.style.display = "block";
}

function editProduct(id) {
    const product = currentProducts.find(p => p.id === id);

    if (!product) {
        alert("Produit introuvable.");
        return;
    }

    editingProductId = id;

    document.getElementById("product-name").value = product.name || "";
    document.getElementById("product-category").value = product.category || "";
    document.getElementById("product-price").value = product.price || "";
    updateSubcategories(product.subcategory || "");
    document.getElementById("product-description").value = product.description || "";
    document.getElementById("product-stock").value = product.stock === null || product.stock === undefined ? "" : product.stock;
    document.getElementById("product-active").checked = product.active !== false;
    showImagePreview(product.image || "");
    document.getElementById("product-featured").checked = product.featured === true;
    document.getElementById("product-alcohol").checked = product.alcohol === true;

    document.getElementById("product-label-enabled").checked =
        product.label_enabled === true;

    document.getElementById("product-ingredients").value =
        product.ingredients || "";

    document.getElementById("product-allergens").value =
        product.allergens || "";

    document.getElementById("product-net-weight").value =
        product.net_weight || "";

    document.getElementById("product-shelf-life").value =
        product.shelf_life_days ?? "";

    document.getElementById("product-storage").value =
        product.storage_instructions ||
        "À conserver entre 0 °C et +4 °C";

    document.querySelector("#product-form h2").textContent = "Modifier le produit";
    document.getElementById("save-product").textContent = "Enregistrer les modifications";

    const form = document.getElementById("product-form");
    form.style.display = "block";
    form.scrollIntoView({ behavior: "smooth" });
}

async function deleteProduct(id) {
    if (!confirm("Supprimer définitivement ce produit ?")) return;

    try {
        const response = await fetch("/.netlify/functions/delete-product", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify({ id })
        });

        const result = await response.json();

        if (!response.ok) throw new Error(result.error || "Erreur de suppression");

        alert("Produit supprimé.");
        await loadProducts();
    } catch (error) {
        alert("Erreur : " + error.message);
    }
}
window.addEventListener("load", function () {


    const form = document.getElementById("product-form");

    document.getElementById("new-product").onclick = function () {
        resetForm();
        form.style.display = "block";
        form.scrollIntoView({ behavior: "smooth" });
    };

    document.getElementById("cancel-product").onclick = function () {
        resetForm();
        form.style.display = "none";
    };
    document.getElementById("product-image").addEventListener("change", function () {
        const file = this.files[0];
        if (!file) return;

        const previewUrl = URL.createObjectURL(file);
        showImagePreview(previewUrl);
    });

    document.getElementById("save-product").onclick = async function () {

        const button = document.getElementById("save-product");

        const product = {
            name: document.getElementById("product-name").value.trim(),
            category: document.getElementById("product-category").value.trim(),
            price: document.getElementById("product-price").value,
            description: document.getElementById("product-description").value.trim(),
            subcategory: document.getElementById("product-subcategory").value.trim(),
            stock: document.getElementById("product-stock").value,
            active: document.getElementById("product-active").checked,
            featured: document.getElementById("product-featured").checked,
            alcohol: document.getElementById("product-alcohol").checked,

            label_enabled:
                document.getElementById("product-label-enabled").checked,

            ingredients:
                document.getElementById("product-ingredients").value.trim(),

            allergens:
                document.getElementById("product-allergens").value.trim(),

            net_weight:
                document.getElementById("product-net-weight").value.trim(),

            storage_instructions:
                document.getElementById("product-storage").value.trim(),

            shelf_life_days:
                document.getElementById("product-shelf-life").value
        };

        const imageInput = document.getElementById("product-image");

        if (imageInput.files.length > 0) {
            try {
                button.disabled = true;
                button.textContent = "Envoi de la photo...";

                const formData = new FormData();
                formData.append("image", imageInput.files[0]);

                const imageResponse = await fetch("/.netlify/functions/upload-product-image", {
                    method: "POST",
                    credentials: "same-origin",
                    body: formData
                });

                const imageResult = await imageResponse.json();

                if (!imageResponse.ok) {
                    throw new Error(imageResult.error || "Erreur lors de l upload de la photo");
                }

                product.image = imageResult.url;

            } catch (error) {
                alert("Erreur photo : " + error.message);
                button.disabled = false;
                button.textContent = "Enregistrer";
                return;
            }
        }

        if (!product.name || product.price === "") {
            alert("Le nom et le prix sont obligatoires.");
            return;
        }

        if (editingProductId && !product.image) {
            const existingProduct = currentProducts.find(p => p.id === editingProductId);
            if (existingProduct && existingProduct.image) {
                product.image = existingProduct.image;
            }
        }
        if (editingProductId) {
            product.id = editingProductId;
        }

        const endpoint = editingProductId
            ? "/.netlify/functions/update-product"
            : "/.netlify/functions/save-product";

        try {
            button.disabled = true;
            button.textContent = "Enregistrement...";

            const response = await fetch(endpoint, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                credentials: "same-origin",
                body: JSON.stringify(product)
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || "Erreur lors de l'enregistrement");
            }

            alert(editingProductId
                ? "Produit modifié."
                : "Produit enregistré."
            );

            resetForm();
            form.style.display = "none";

            await loadProducts();

        } catch (error) {
            alert("Erreur : " + error.message);

        } finally {
            button.disabled = false;

            if (!editingProductId) {
                button.textContent = "Enregistrer";
            }
        }
    };
});


function filterProducts() {
    const search = document.getElementById("search").value.toLowerCase().trim();
    const category = document.getElementById("category-filter").value;

    const rows = document.querySelectorAll("#products-table .product-table-row");

    rows.forEach((row, index) => {
        const product = currentProducts[index];

        if (!product) return;

        const text = [
            product.name,
            product.category,
            product.description
        ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

        const matchesSearch = text.includes(search);
        const matchesCategory = !category || product.category === category;

        row.style.display =
            matchesSearch && matchesCategory ? "flex" : "none";
    });
}

document.getElementById("search").addEventListener("input", filterProducts);
document.getElementById("category-filter").addEventListener("change", filterProducts);





document.getElementById("product-category").addEventListener("change", () => {
    updateSubcategories();
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
            await loadProducts();
        }
    } catch (error) {
        console.error("Session administrateur :", error);
    }
}

initialiseAdminSession();
