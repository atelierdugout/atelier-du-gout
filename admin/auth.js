(() => {
  const API = "/.netlify/functions";

  async function jsonFetch(url, options = {}) {
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
      const error = new Error(
        data?.error || `Erreur HTTP ${response.status}`
      );
      error.status = response.status;
      throw error;
    }

    return data;
  }

  async function sessionStatus() {
    return jsonFetch(`${API}/admin-session-status`);
  }

  async function loginWithPin(pin) {
    return jsonFetch(`${API}/admin-session-login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        pin: String(pin || "")
      })
    });
  }

  async function loginWithPasskey() {
    if (!window.SimpleWebAuthnBrowser) {
      throw new Error("Bibliothèque Passkey indisponible.");
    }

    const start = await jsonFetch(
      `${API}/admin-passkey-login-options`,
      {
        method: "POST"
      }
    );

    const response =
      await window.SimpleWebAuthnBrowser.startAuthentication({
        optionsJSON: start.options
      });

    return jsonFetch(
      `${API}/admin-passkey-login-verify`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          challengeID: start.challengeID,
          response
        })
      }
    );
  }

  async function registerPasskey(deviceName = "Appareil administrateur") {
    if (!window.SimpleWebAuthnBrowser) {
      throw new Error("Bibliothèque Passkey indisponible.");
    }

    const start = await jsonFetch(
      `${API}/admin-passkey-register-options`,
      {
        method: "POST"
      }
    );

    const response =
      await window.SimpleWebAuthnBrowser.startRegistration({
        optionsJSON: start.options
      });

    return jsonFetch(
      `${API}/admin-passkey-register-verify`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          challengeID: start.challengeID,
          response,
          deviceName
        })
      }
    );
  }

  async function logout() {
    return jsonFetch(`${API}/admin-session-status`, {
      method: "DELETE"
    });
  }

  window.AdminAuth = {
    sessionStatus,
    loginWithPin,
    loginWithPasskey,
    registerPasskey,
    logout
  };
})();
