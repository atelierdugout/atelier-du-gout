(() => {
    const $ = id => document.getElementById(id);

    let reprintContext = null;

    window.LabelReprintContext = {
        set(id, reason) {
            reprintContext = {
                original_print_id: String(id || "").trim(),
                reprint_reason: String(reason || "").trim()
            };
        },
        clear() {
            reprintContext = null;
        }
    };

    function clean(s) {
        return String(s || "")
            .replace(/œ/g, "oe")
            .replace(/Œ/g, "OE")
            .replace(/’/g, "'")
            .replace(/–/g, "-");
    }

    function productName() {
        return $("customProduct").value.trim() ||
               $("product").selectedOptions[0]?.textContent ||
               "PREPARATION";
    }

    function fmtDate(value) {
        if (!value) return "";

        const [y,m,d] = value.split("-");
        return `${d}/${m}/${y}`;
    }

    function fmtDateTime(value) {
        if (!value) return "";

        const d = new Date(value);

        return d.toLocaleString("fr-FR", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        });
    }

    function isSale() {
        return !$("saleFields").classList.contains("hidden");
    }

    function validate() {
        if (!$("product").value && !$("customProduct").value.trim())
            return "Choisis une préparation.";

        if (!$("production").value)
            return "Date de préparation manquante.";

        if (!$("lifeDays").value || !$("expiry").value)
            return "La durée de conservation doit être définie.";

        if (
            !$("allergens").value.trim() ||
            $("allergens").value.toLowerCase().includes("compléter")
        )
            return "Les allergènes doivent être vérifiés.";

        if (isSale() && !$("ingredients").value.trim())
            return "Les ingrédients sont obligatoires.";

        if (isSale() && !$("weight").value.trim())
            return "Le poids net est obligatoire.";

        return null;
    }

    function wrapped(doc, title, value, y) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7.5);
        doc.text(clean(title), 3.5, y);

        y += 3;

        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);

        const lines = doc.splitTextToSize(
            clean(value || "-"),
            51
        );

        doc.text(lines, 3.5, y);

        return y + lines.length * 3 + 1;
    }

    function drawLabel(doc, sale) {
        let y = 4.5;

        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);

        const title = doc.splitTextToSize(
            clean(productName().toUpperCase()),
            51
        );

        doc.text(title, 29, y, {
            align: "center"
        });

        y += title.length * 4 + 1;

        doc.setLineWidth(0.2);
        doc.line(3.5, y, 54.5, y);

        y += 3.5;

        doc.setFontSize(7.5);
        doc.setFont("helvetica", "normal");

        doc.text(
            `Préparé : ${clean(fmtDateTime($("production").value))}`,
            3.5,
            y
        );

        y += 4;

        doc.setFont("helvetica", "bold");
        doc.setFontSize(8.5);

        doc.text(
            "A CONSOMMER JUSQU'AU",
            3.5,
            y
        );

        y += 4;

        doc.setFontSize(11);

        doc.text(
            fmtDate($("expiry").value),
            3.5,
            y
        );

        y += 5;

        y = wrapped(
            doc,
            "Conservation",
            $("storage").value,
            y
        );

        if (sale) {
            y = wrapped(
                doc,
                "Ingrédients",
                $("ingredients").value,
                y
            );

            y = wrapped(
                doc,
                "Poids net",
                $("weight").value,
                y
            );
        }

        y = wrapped(
            doc,
            "ALLERGENES",
            $("allergens").value.toUpperCase(),
            y
        );

        y = wrapped(
            doc,
            "Lot",
            $("lot").value,
            y
        );

        y += 0.5;

        doc.line(3.5, y, 54.5, y);
        y += 3.5;

        doc.setFont("helvetica", "bold");
        doc.setFontSize(7.5);

        doc.text(
            "L'ATELIER DU GOUT",
            29,
            y,
            { align: "center" }
        );

        y += 3;

        doc.setFont("helvetica", "normal");
        doc.setFontSize(6.5);

        doc.text(
            "AULNAY-DE-SAINTONGE",
            29,
            y,
            { align: "center" }
        );
    }

    async function saveTraceability(quantity, sale) {
        const productId =
            $("product").value || null;

        const payload = {
            product_id: productId,
            product_name: productName(),
            label_type: sale ? "sale" : "internal",
            lot: $("lot").value.trim(),
            production_at: new Date($("production").value).toISOString(),
            expiry_date: $("expiry").value || null,
            quantity: quantity,
            net_weight: sale ? $("weight").value.trim() : null,
            storage_instructions: $("storage").value.trim(),
            ingredients: sale ? $("ingredients").value.trim() : null,
            allergens: $("allergens").value.trim(),
            original_print_id:
                reprintContext?.original_print_id || null,
            reprint_reason:
                reprintContext?.reprint_reason || null
        };

        const response = await fetch(
            "/.netlify/functions/admin-label-print-log",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                credentials: "same-origin",
                body: JSON.stringify(payload)
            }
        );

        const result = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(
                result.error ||
                "Impossible d'enregistrer la traçabilité."
            );
        }

        return result;
    }

    async function confirmPrintResult(id, result, reason = "") {
        const response = await fetch(
            "/.netlify/functions/admin-label-print-result",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                credentials: "same-origin",
                body: JSON.stringify({
                    id,
                    result,
                    reason
                })
            }
        );

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(
                data.error ||
                "Impossible de confirmer le résultat d'impression."
            );
        }

        return data;
    }

    async function printLabel() {
        const error = validate();

        if (error) {
            $("status").textContent = "⚠️ " + error;
            return;
        }

        const sale = isSale();

        const quantity = Math.max(
            1,
            Math.min(
                10,
                Number($("labelQuantity").value) || 1
            )
        );

        $("status").textContent =
            `Préparation de ${quantity} étiquette${quantity > 1 ? "s" : ""}…`;

        const height = sale ? 95 : 58;

        const doc = new window.jsPDF({
            orientation: "portrait",
            unit: "mm",
            format: [58, height],
            compress: true
        });

        for (let i = 0; i < quantity; i++) {
            if (i > 0) {
                doc.addPage([58, height], "portrait");
            }

            drawLabel(doc, sale);
        }

        const dataUri = doc.output("datauristring");

        const pdfData =
            dataUri.substring(dataUri.indexOf(",") + 1);

        $("status").textContent =
            "Enregistrement de la demande d'impression…";

        let traceability;

        try {
            traceability =
                await saveTraceability(quantity, sale);
        } catch (err) {
            console.error("Traçabilité étiquette :", err);

            $("status").textContent =
                "⚠️ Impression annulée : " + err.message;

            return;
        }

        const printId = traceability?.log?.id;

        if (printId) {
            window.LabelReprintContext.clear();
        }

        if (!printId) {
            $("status").textContent =
                "⚠️ Impression annulée : identifiant de traçabilité absent.";
            return;
        }

        const thisPage =
            window.location.href.split("?")[0];

        const successCallback =
            thisPage +
            "?print=success&id=" +
            encodeURIComponent(printId) +
            "&qty=" +
            quantity;

        const failCallback =
            thisPage +
            "?print=fail&id=" +
            encodeURIComponent(printId);

        const url =
            "siiprintagent://1.0/print?" +
            "CallbackSuccess=" +
            encodeURIComponent(successCallback) +
            "&CallbackFail=" +
            encodeURIComponent(failCallback) +
            "&Format=pdf" +
            "&Data=" +
            encodeURIComponent(pdfData) +
            "&SelectOnError=yes" +
            "&CutType=full" +
            "&CutFeed=yes" +
            "&FitToWidth=no" +
            "&PaperWidth=58";

        $("status").textContent =
            "Demande enregistrée. Ouverture de SII URL Print Agent…";

        window.location.href = url;
    }

    const oldButton = $("printBtn");
    const newButton = oldButton.cloneNode(true);

    oldButton.parentNode.replaceChild(
        newButton,
        oldButton
    );

    newButton.addEventListener(
        "click",
        printLabel
    );

    const params =
        new URLSearchParams(window.location.search);

    const printResult = params.get("print");
    const printId = params.get("id");

    if (
        (printResult === "success" || printResult === "fail") &&
        printId
    ) {
        (async () => {
            try {
                if (printResult === "success") {
                    const qty =
                        Number(params.get("qty")) || 1;

                    $("status").textContent =
                        "Confirmation de l'impression…";

                    await confirmPrintResult(
                        printId,
                        "printed"
                    );

                    $("status").textContent =
                        `✓ ${qty} étiquette${qty > 1 ? "s" : ""} imprimée${qty > 1 ? "s" : ""}.`;
                } else {
                    $("status").textContent =
                        "Enregistrement de l'échec d'impression…";

                    await confirmPrintResult(
                        printId,
                        "failed",
                        "Échec signalé par SII URL Print Agent"
                    );

                    $("status").textContent =
                        "⚠️ Impression échouée. Vérifie la connexion SII.";
                }

                const cleanUrl =
                    window.location.pathname +
                    window.location.hash;

                window.history.replaceState(
                    {},
                    "",
                    cleanUrl
                );

            } catch (err) {
                console.error(
                    "Confirmation impression :",
                    err
                );

                $("status").textContent =
                    "⚠️ Résultat reçu de SII, mais la traçabilité n'a pas pu être mise à jour : " +
                    err.message;
            }
        })();
    }

})();
