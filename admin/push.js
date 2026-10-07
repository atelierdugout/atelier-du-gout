function urlBase64ToUint8Array(base64String) {
    const padding = "=".repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/-/g, "+")
        .replace(/_/g, "/");

    const rawData = atob(base64);
    return Uint8Array.from([...rawData].map(char => char.charCodeAt(0)));
}

function uint8ArrayToBase64Url(array) {
    let binary = "";
    const bytes = new Uint8Array(array);

    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }

    return btoa(binary)
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/g, "");
}

const button = document.getElementById("enable-push");
const statusBox = document.getElementById("push-status");

button?.addEventListener("click", async () => {
    try {
        const permission = await Notification.requestPermission();

        if (permission !== "granted") {
            statusBox.textContent = "Notifications non autorisées.";
            return;
        }

        const registration = await navigator.serviceWorker.ready;

        const keyResponse = await fetch("/.netlify/functions/push-public-key", {
            cache: "no-store"
        });

        if (!keyResponse.ok) {
            throw new Error("Clé push indisponible.");
        }

        const { publicKey } = await keyResponse.json();

        const oldSubscription = await registration.pushManager.getSubscription();

        if (oldSubscription) {
            await oldSubscription.unsubscribe();
        }

        const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(publicKey)
        });

        const iosKey = subscription.options?.applicationServerKey
            ? uint8ArrayToBase64Url(subscription.options.applicationServerKey)
            : null;

        const keyMatches = iosKey === publicKey;

        if (!keyMatches) {
            statusBox.textContent = "ERREUR : la clé iPhone ne correspond pas à la clé Netlify.";
            return;
        }

        const response = await fetch("/.netlify/functions/push-subscribe", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            credentials: "same-origin",
            body: JSON.stringify(subscription)
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(data.error || "Enregistrement refusé.");
        }

        statusBox.textContent = "✓ Notifications activées — clé iPhone vérifiée.";
        button.textContent = "🔔 Notifications activées";
        button.disabled = true;

    } catch (error) {
        console.error(error);
        statusBox.textContent = "Erreur : " + (error.message || String(error));
    }
});
