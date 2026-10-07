(() => {
    const button = document.getElementById("register-passkey");
    const status = document.getElementById("passkey-status");

    if (!button || !status) return;

    function message(text) {
        status.textContent = text;
    }

    async function checkSession() {
        try {
            const session = await window.AdminAuth.sessionStatus();

            if (!session.authenticated) {
                message("Reconnectez-vous depuis l'accueil de l'administration.");
                button.disabled = true;
                return false;
            }

            return true;
        } catch (error) {
            console.error("Vérification session :", error);
            message("Impossible de vérifier la session administrateur.");
            button.disabled = true;
            return false;
        }
    }

    button.addEventListener("click", async () => {
        if (!(await checkSession())) return;

        button.disabled = true;
        message("Enregistrement du Passkey en cours…");

        try {
            await window.AdminAuth.registerPasskey(
                "Appareil administrateur"
            );

            message(
                "Face ID / Passkey enregistré. Vous pourrez l'utiliser lors de votre prochaine connexion."
            );
        } catch (error) {
            console.error("Enregistrement Passkey :", error);

            if (error.name === "NotAllowedError") {
                message("Enregistrement annulé.");
            } else {
                message(error.message || "Impossible d'enregistrer le Passkey.");
            }
        } finally {
            button.disabled = false;
        }
    });

    checkSession();
})();
