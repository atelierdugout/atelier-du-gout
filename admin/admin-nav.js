(() => {
  "use strict";

  const items = [
    { href: "/admin/", label: "Accueil", icon: "⌂" },
    { href: "/admin/assistant.html", label: "Business Brain", icon: "✦" },
    { href: "/admin/commandes.html", label: "Commandes", icon: "▣" },
    { href: "/admin/reservations.html", label: "Réservations", icon: "◷" },
    { href: "/admin/produits.html", label: "Produits", icon: "□" },
    { href: "/admin/clients.html", label: "Clients", icon: "♙" },
    { href: "/admin/fidelite.html", label: "Fidélité", icon: "♡" },
    { href: "/admin/cartes-cadeaux.html", label: "Cartes cadeaux", icon: "◇" },
    { href: "/admin/hygiene.html", label: "HACCP", icon: "✓" },
    { href: "/admin/labels.html", label: "Étiquettes", icon: "▤" },
    { href: "/admin/statistiques.html", label: "Statistiques", icon: "↗" },
    { href: "/admin/parametres.html", label: "Paramètres", icon: "⚙" }
  ];

  function normalizePath(pathname) {
    if (pathname === "/admin/index.html") return "/admin/";
    return pathname;
  }

  function escapeHTML(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function render() {
    if (document.querySelector(".admin-global-nav")) return;

    const current = normalizePath(location.pathname);

    const nav = document.createElement("div");
    nav.className = "admin-global-nav";

    nav.innerHTML = `
      <div class="admin-global-nav-bar">
        <a href="/admin/" class="admin-global-brand">
          <span class="admin-global-brand-mark">A</span>
          <span>
            <strong>L'Atelier du Goût</strong>
            <small>Administration</small>
          </span>
        </a>

        <div class="admin-global-actions">
          <a
            href="/"
            target="_blank"
            rel="noopener"
            class="admin-global-shop"
          >Boutique ↗</a>

          <button
            type="button"
            class="admin-global-menu-button"
            aria-expanded="false"
            aria-controls="admin-global-drawer"
          >
            <span>Menu</span>
            <span aria-hidden="true">☰</span>
          </button>
        </div>
      </div>

      <div class="admin-global-overlay" hidden></div>

      <aside
        id="admin-global-drawer"
        class="admin-global-drawer"
        aria-hidden="true"
      >
        <div class="admin-global-drawer-head">
          <div>
            <strong>Administration</strong>
            <small>L'Atelier du Goût</small>
          </div>

          <button
            type="button"
            class="admin-global-close"
            aria-label="Fermer le menu"
          >×</button>
        </div>

        <nav class="admin-global-links" aria-label="Navigation administration">
          ${items.map(item => {
            const active = current === item.href;

            return `
              <a
                href="${item.href}"
                class="${active ? "is-active" : ""}"
                ${active ? 'aria-current="page"' : ""}
              >
                <span class="admin-global-link-icon" aria-hidden="true">
                  ${escapeHTML(item.icon)}
                </span>
                <span>${escapeHTML(item.label)}</span>
              </a>
            `;
          }).join("")}
        </nav>

        <div class="admin-global-drawer-footer">
          <button type="button" class="admin-global-logout">
            Déconnexion
          </button>
        </div>
      </aside>
    `;

    document.body.prepend(nav);

    const button = nav.querySelector(".admin-global-menu-button");
    const drawer = nav.querySelector(".admin-global-drawer");
    const overlay = nav.querySelector(".admin-global-overlay");
    const close = nav.querySelector(".admin-global-close");
    const logout = nav.querySelector(".admin-global-logout");

    function setOpen(open) {
      drawer.classList.toggle("is-open", open);
      overlay.hidden = !open;
      drawer.setAttribute("aria-hidden", String(!open));
      button.setAttribute("aria-expanded", String(open));
      document.body.classList.toggle("admin-nav-open", open);
    }

    button.addEventListener("click", () => {
      setOpen(!drawer.classList.contains("is-open"));
    });

    close.addEventListener("click", () => setOpen(false));
    overlay.addEventListener("click", () => setOpen(false));

    document.addEventListener("keydown", event => {
      if (event.key === "Escape") setOpen(false);
    });

    logout.addEventListener("click", async () => {
      logout.disabled = true;
      logout.textContent = "Déconnexion…";

      try {
        if (window.AdminAuth?.logout) {
          await window.AdminAuth.logout();
        }

        location.href = "/admin/";
      } catch (error) {
        console.error(error);
        logout.disabled = false;
        logout.textContent = "Déconnexion";
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", render);
  } else {
    render();
  }
})();
