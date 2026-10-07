(() => {
    const $ = (id) => document.getElementById(id);

    let conversation = [];
    let conversationId = null;

    function addMessage(role, text) {
        const messages = $("assistant-messages");

        const wrapper = document.createElement("div");
        wrapper.className =
            `assistant-message ${
                role === "user"
                    ? "assistant-message-user"
                    : "assistant-message-ai"
            }`;

        const avatar =
            role === "user"
                ? ""
                : `<div class="assistant-avatar">✦</div>`;

        wrapper.innerHTML = `
            ${avatar}
            <div class="assistant-bubble">
                ${role === "assistant" ? "<strong>Business Brain</strong>" : ""}
                <p>${escapeHtml(text).replaceAll("\n", "<br>")}</p>
            </div>
        `;

        messages.appendChild(wrapper);
        messages.scrollTop = messages.scrollHeight;
    }

    function escapeHtml(value) {
        return String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    async function loadConversations() {
        const response = await fetch(
            "/.netlify/functions/admin-ai-conversations",
            {
                credentials: "same-origin",
                cache: "no-store"
            }
        );

        const data = await response.json();

        if (!response.ok) {
            throw new Error(
                data.error || "Impossible de charger les conversations."
            );
        }

        const list = $("assistant-conversation-list");
        const items = data.conversations || [];

        if (!items.length) {
            list.innerHTML =
                '<p class="assistant-history-empty">Aucune conversation enregistrée.</p>';
            return;
        }

        list.innerHTML = "";

        for (const item of items) {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "assistant-history-item";
            button.textContent = item.title || "Conversation";

            button.addEventListener("click", () => {
                openConversation(item.id);
            });

            list.appendChild(button);
        }
    }

    async function openConversation(id) {
        const response = await fetch(
            "/.netlify/functions/admin-ai-conversations?id=" +
                encodeURIComponent(id),
            {
                credentials: "same-origin",
                cache: "no-store"
            }
        );

        const data = await response.json();

        if (!response.ok) {
            throw new Error(
                data.error || "Impossible d'ouvrir la conversation."
            );
        }

        conversationId = id;
        conversation = [];
        $("assistant-messages").innerHTML = "";

        for (const item of data.messages || []) {
            conversation.push({
                role: item.role,
                content: item.content
            });

            addMessage(item.role, item.content);
        }

        $("assistant-input").focus();
    }

    async function sendMessage(message) {
        const response = await fetch(
            "/.netlify/functions/admin-ai-assistant",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                credentials: "same-origin",
                body: JSON.stringify({
                    message,
                    conversation: conversation.slice(0, -1)
                })
            }
        );

        const data = await response.json();

        if (!response.ok) {
            throw new Error(
                data.error || "Impossible de contacter l'Assistant IA."
            );
        }

        return data;
    }

    

    $("assistant-form").addEventListener("submit", async (event) => {
        event.preventDefault();

        const input = $("assistant-input");
        const sendButton = $("assistant-send");
        const status = $("assistant-status-text");

        const message = input.value.trim();

        if (!message) return;

        addMessage("user", message);

        conversation.push({
            role: "user",
            content: message
        });

        input.value = "";
        sendButton.disabled = true;
        input.disabled = true;
        status.textContent = "Analyse en cours…";

        try {
            const data = await sendMessage(message);

            const answer =
                data.answer ||
                "L'Assistant n'a pas retourné de réponse.";

            conversationId = data.conversation_id || conversationId;

            addMessage("assistant", answer);
            await loadConversations();

            conversation.push({
                role: "assistant",
                content: answer
            });

            status.textContent = "Prêt";
        } catch (error) {
            addMessage(
                "assistant",
                `Erreur : ${error.message}`
            );

            status.textContent = "Erreur";
        } finally {
            sendButton.disabled = false;
            input.disabled = false;
            input.focus();
        }
    });

    $("clear-conversation").addEventListener("click", () => {
        conversation = [];
        conversationId = null;

        $("assistant-messages").innerHTML = `
            <div class="assistant-message assistant-message-ai">
                <div class="assistant-avatar">✦</div>
                <div class="assistant-bubble">
                    <strong>Business Brain</strong>
                    <p>
                        Nouvelle conversation. Que voulez-vous savoir
                        ou faire ?
                    </p>
                </div>
            </div>
        `;

        $("assistant-input").focus();
    });
})();
