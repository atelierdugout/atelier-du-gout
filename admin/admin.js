(() => {
  const loginPanel = document.getElementById("admin-login");
  const dashboard = document.getElementById("admin-dashboard");
  const passkeyButton = document.getElementById("passkey-login");
  const pinForm = document.getElementById("pin-login-form");
  const pinInput = document.getElementById("admin-pin");
  const errorBox = document.getElementById("login-error");

  function getReturnPath() {
    const params = new URLSearchParams(window.location.search);
    const value = params.get("return");

    if (!value) return null;

    try {
      const url = new URL(value, window.location.origin);

      if (
        url.origin !== window.location.origin ||
        !url.pathname.startsWith("/admin/") ||
        url.pathname === "/admin/"
      ) {
        return null;
      }

      return url.pathname + url.search + url.hash;
    } catch {
      return null;
    }
  }

  function finishLogin() {
    const returnPath = getReturnPath();

    if (returnPath) {
      window.location.replace(returnPath);
      return;
    }

    showDashboard();
  }

  function showError(message) {
    if (errorBox) {
      errorBox.textContent = message || "Connexion impossible.";
    }
  }

  function showDashboard() {
    if (loginPanel) loginPanel.hidden = true;
    if (dashboard) dashboard.hidden = false;
  }

  function showLogin() {
    if (dashboard) dashboard.hidden = true;
    if (loginPanel) loginPanel.hidden = false;
  }


  function euro(cents) {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: "EUR"
    }).format(Number(cents || 0) / 100);
  }

  function plural(value, singular, pluralForm) {
    return Number(value) === 1
      ? singular
      : (pluralForm || singular + "s");
  }

  async function loadCockpit() {
    const updated = document.getElementById("cockpit-updated");

    if (!document.getElementById("cockpit-today")) return;

    try {
      const response = await fetch(
        "/.netlify/functions/admin-cockpit",
        {
          credentials: "same-origin",
          cache: "no-store"
        }
      );

      if (response.status === 401) {
        showLogin();
        return;
      }

      if (!response.ok) {
        throw new Error("Cockpit indisponible.");
      }

      const data = await response.json();

      const sales = data.sales || {};
      const orders = data.orders || {};
      const reservations = data.reservations || {};
      const haccp = data.haccp || {};

      document.getElementById("cockpit-revenue").textContent =
        euro(sales.revenue_cents);

      document.getElementById("cockpit-sales-detail").textContent =
        `${sales.order_count || 0} ${plural(
          sales.order_count,
          "commande"
        )} · panier ${euro(sales.average_order_cents)}`;

      document.getElementById("cockpit-orders").textContent =
        String(orders.remaining || 0);

      document.getElementById("cockpit-orders-detail").textContent =
        `${orders.total || 0} aujourd’hui · ${orders.remaining || 0} à traiter`;

      document.getElementById("cockpit-reservations").textContent =
        String(reservations.total || 0);

      document.getElementById("cockpit-reservations-detail").textContent =
        `${reservations.covers || 0} ${plural(
          reservations.covers,
          "couvert"
        )}`;

      document.getElementById("cockpit-haccp").textContent =
        String(haccp.pending || 0);

      document.getElementById("cockpit-haccp-detail").textContent =
        `${haccp.done || 0}/${haccp.total || 0} terminées`;

      if (Number(orders.remaining || 0) > 0) {
        document
          .getElementById("cockpit-orders")
          ?.closest(".cockpit-card")
          ?.classList.add("is-attention");
      }

      if (Number(haccp.pending || 0) > 0) {
        document
          .getElementById("cockpit-haccp")
          ?.closest(".cockpit-card")
          ?.classList.add("is-attention");
      }


      const next = data.next || {};

      const nextOrder = next.order;
      const nextReservation = next.reservation;
      const nextHaccp = next.haccp;

      const orderTitle =
        document.getElementById("cockpit-next-order");
      const orderDetail =
        document.getElementById("cockpit-next-order-detail");

      if (nextOrder) {
        orderTitle.textContent =
          [nextOrder.time, nextOrder.customer_name]
            .filter(Boolean)
            .join(" · ") ||
          nextOrder.reference ||
          "Commande";

        orderDetail.textContent =
          [
            nextOrder.mode === "delivery"
              ? "Livraison"
              : nextOrder.mode === "pickup"
                ? "Retrait"
                : nextOrder.mode,
            nextOrder.reference
          ]
            .filter(Boolean)
            .join(" · ");
      }

      const reservationTitle =
        document.getElementById("cockpit-next-reservation");
      const reservationDetail =
        document.getElementById("cockpit-next-reservation-detail");

      if (nextReservation) {
        reservationTitle.textContent =
          [
            nextReservation.time,
            nextReservation.customer_name
          ]
            .filter(Boolean)
            .join(" · ") ||
          "Réservation";

        reservationDetail.textContent =
          `${nextReservation.party_size || 0} ${plural(
            nextReservation.party_size,
            "couvert"
          )}`;
      }

      const haccpTitle =
        document.getElementById("cockpit-next-haccp");
      const haccpDetail =
        document.getElementById("cockpit-next-haccp-detail");

      if (nextHaccp) {
        haccpTitle.textContent =
          [nextHaccp.time, nextHaccp.title]
            .filter(Boolean)
            .join(" · ");

        haccpDetail.textContent =
          nextHaccp.type === "temperature"
            ? "Contrôle de température"
            : "Tâche HACCP";
      }

      const priorities =
        document.getElementById("cockpit-priorities");

      if (priorities) {
        priorities.replaceChildren();

        for (const priority of data.priorities || []) {
          const element = document.createElement(
            priority.href ? "a" : "div"
          );

          element.className =
            "cockpit-priority " +
            (
              priority.level === "attention"
                ? "is-attention"
                : priority.level === "ok"
                  ? "is-ok"
                  : ""
            );

          element.textContent = priority.text || "";

          if (priority.href) {
            element.href = priority.href;
          }

          priorities.appendChild(element);
        }
      }

      if (updated) {
        updated.textContent =
          "Mis à jour à " +
          new Intl.DateTimeFormat("fr-FR", {
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "Europe/Paris"
          }).format(new Date(data.generated_at));
      }
    } catch (error) {
      console.error("Cockpit :", error);

      if (updated) {
        updated.textContent =
          "Données momentanément indisponibles";
      }

      document
        .querySelectorAll(".cockpit-card")
        .forEach(card => card.classList.add("is-error"));
    }
  }


  function euro(cents) {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: "EUR"
    }).format(Number(cents || 0) / 100);
  }

  function plural(value, singular, pluralForm) {
    return Number(value) === 1
      ? singular
      : (pluralForm || singular + "s");
  }

  async function checkSession() {
    try {
      const status = await window.AdminAuth.sessionStatus();

      if (status.authenticated) {
        const returnPath = getReturnPath();

        if (returnPath) {
          finishLogin();
          return;
        }

        showDashboard();
        await loadCockpit();
        return;
      }
    } catch (error) {
      console.error("Vérification session admin :", error);
    }

    showLogin();
  }

  if (passkeyButton) {
    passkeyButton.addEventListener("click", async () => {
      errorBox.textContent = "";
      passkeyButton.disabled = true;

      try {
        await window.AdminAuth.loginWithPasskey();

        const status = await window.AdminAuth.sessionStatus();

        if (!status?.authenticated) {
          throw new Error(
            "La connexion est acceptée, mais la session administrateur n'est pas disponible."
          );
        }

        finishLogin();
      } catch (error) {
        console.error("Connexion Passkey :", error);

        if (error.status === 404) {
          showError(
            "Aucun Passkey n'est encore enregistré. Utilisez le code administrateur."
          );
        } else if (error.name === "NotAllowedError") {
          showError("Connexion biométrique annulée.");
        } else {
          showError(error.message);
        }
      } finally {
        passkeyButton.disabled = false;
      }
    });
  }

  if (pinForm) {
    pinForm.addEventListener("submit", async event => {
      event.preventDefault();
      errorBox.textContent = "";

      const pin = pinInput.value.trim();

      if (!pin) {
        showError("Entrez votre code administrateur.");
        return;
      }

      const submitButton = pinForm.querySelector(
        'button[type="submit"]'
      );

      if (submitButton) submitButton.disabled = true;

      try {
        const login = await window.AdminAuth.loginWithPin(pin);
const status = await window.AdminAuth.sessionStatus();
if (!status?.authenticated) {
          throw new Error(
            "Le PIN est accepté, mais le navigateur n'a pas conservé la session administrateur."
          );
        }

        pinInput.value = "";
        showDashboard();
      } catch (error) {
        console.error("Connexion PIN :", error);
        showError(error.message);
      } finally {
        if (submitButton) submitButton.disabled = false;
      }
    });
  }

  checkSession();
})();
