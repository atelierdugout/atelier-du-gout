(() => {
  const ENDPOINT = "/.netlify/functions/track-visit";
  const SESSION_DURATION = 30 * 60 * 1000;

  const boutiquePages = new Set([
    "/manger.html",
    "/boissons.html",
    "/epicerie.html",
    "/coffrets.html",
    "/cadeaux.html",
    "/minargent.html"
  ]);

  function id() {
    if (crypto?.randomUUID) {
      return crypto.randomUUID();
    }

    return (
      Date.now().toString(36) +
      Math.random().toString(36).slice(2)
    );
  }

  function getVisitorId() {
    let value = localStorage.getItem("adg_visitor_id");

    if (!value) {
      value = id();
      localStorage.setItem("adg_visitor_id", value);
    }

    return value;
  }

  function getSessionId() {
    const now = Date.now();

    let sessionId = sessionStorage.getItem(
      "adg_session_id"
    );

    const lastActivity = Number(
      sessionStorage.getItem(
        "adg_session_last_activity"
      ) || 0
    );

    if (
      !sessionId ||
      !lastActivity ||
      now - lastActivity > SESSION_DURATION
    ) {
      sessionId = id();
      sessionStorage.setItem(
        "adg_session_id",
        sessionId
      );
    }

    sessionStorage.setItem(
      "adg_session_last_activity",
      String(now)
    );

    return sessionId;
  }

  function detectSource(params) {
    const utmSource = (
      params.get("utm_source") || ""
    ).toLowerCase();

    if (utmSource.includes("instagram")) {
      return "instagram";
    }

    if (
      utmSource.includes("facebook") ||
      utmSource === "fb"
    ) {
      return "facebook";
    }

    if (utmSource.includes("google")) {
      return "google";
    }

    const referrer = (
      document.referrer || ""
    ).toLowerCase();

    if (!referrer) {
      return "direct";
    }

    if (referrer.includes("instagram.")) {
      return "instagram";
    }

    if (
      referrer.includes("facebook.") ||
      referrer.includes("fb.com") ||
      referrer.includes("l.facebook.com")
    ) {
      return "facebook";
    }

    if (referrer.includes("google.")) {
      return "google";
    }

    try {
      const referrerUrl = new URL(document.referrer);

      if (
        referrerUrl.hostname ===
        window.location.hostname
      ) {
        return "direct";
      }
    } catch {}

    return "other";
  }

  async function track() {
    try {
      const params = new URLSearchParams(
        window.location.search
      );

      const path = window.location.pathname;

      const payload = {
        visitor_id: getVisitorId(),
        session_id: getSessionId(),
        path,
        section: boutiquePages.has(path)
          ? "boutique"
          : "site",
        source: detectSource(params),
        referrer: document.referrer || null,
        utm_source:
          params.get("utm_source") || null,
        utm_medium:
          params.get("utm_medium") || null,
        utm_campaign:
          params.get("utm_campaign") || null
      };

      await fetch(ENDPOINT, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload),
        keepalive: true
      });

    } catch (error) {
      console.warn(
        "[Analytics] Tracking indisponible",
        error
      );
    }
  }

  track();
})();
