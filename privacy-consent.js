(() => {
  const KEY = "adg_analytics_consent";

  function choice() {
    try {
      return localStorage.getItem(KEY);
    } catch {
      return null;
    }
  }

  function save(value) {
    try {
      localStorage.setItem(KEY, value);
    } catch {}
  }

  function clearAnalyticsStorage() {
    try {
      localStorage.removeItem("adg_visitor_id");
      sessionStorage.removeItem("adg_session_id");
      sessionStorage.removeItem("adg_session_last_activity");
    } catch {}
  }

  function loadAnalytics() {
    if (document.querySelector('script[data-adg-analytics]')) return;

    const script = document.createElement("script");
    script.src = "/analytics.js";
    script.async = true;
    script.dataset.adgAnalytics = "true";
    document.head.appendChild(script);
  }

  function removeBanner() {
    document.getElementById("adg-consent-banner")?.remove();
  }

  function accept() {
    save("accepted");
    removeBanner();
    loadAnalytics();
  }

  function refuse() {
    save("refused");
    clearAnalyticsStorage();
    removeBanner();
  }

  function showBanner() {
    if (document.getElementById("adg-consent-banner")) return;

    const banner = document.createElement("div");
    banner.id = "adg-consent-banner";
    banner.setAttribute("role", "dialog");
    banner.setAttribute("aria-label", "Choix concernant la mesure d’audience");

    banner.innerHTML = `
      <div class="adg-consent-inner">
        <div class="adg-consent-copy">
          <strong>Votre confidentialité</strong>
          <p>
            Nous utilisons une mesure d’audience interne pour comprendre
            la fréquentation du site et l’origine des visites.
            Elle n’est activée qu’avec votre accord.
            <a href="/confidentialite.html">En savoir plus</a>.
          </p>
        </div>
        <div class="adg-consent-actions">
          <button type="button" id="adg-consent-refuse">
            Refuser
          </button>
          <button type="button" id="adg-consent-accept">
            Accepter
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(banner);

    document
      .getElementById("adg-consent-refuse")
      ?.addEventListener("click", refuse);

    document
      .getElementById("adg-consent-accept")
      ?.addEventListener("click", accept);
  }

  window.ADGPrivacy = {
    getAnalyticsConsent: choice,

    openAnalyticsConsent() {
      showBanner();
    },

    withdrawAnalyticsConsent() {
      refuse();
    },

    acceptAnalyticsConsent() {
      accept();
    }
  };

  const current = choice();

  if (current === "accepted") {
    loadAnalytics();
  } else if (current !== "refused") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", showBanner);
    } else {
      showBanner();
    }
  }
})();
