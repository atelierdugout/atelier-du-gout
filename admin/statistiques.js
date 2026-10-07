let statisticsData = null;
let currentPeriod = "month";

const $ = id => document.getElementById(id);

const PERIOD_LABELS = {
  today: "Aujourd’hui",
  "7d": "7 derniers jours",
  month: "Ce mois",
  last_month: "Mois dernier",
  year: "Cette année"
};

const COMPARISON_LABELS = {
  today: "vs hier",
  "7d": "vs 7 jours précédents",
  month: "vs mois précédent",
  last_month: "vs mois précédent",
  year: "vs année précédente"
};

const euro = cents =>
  new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR"
  }).format(Number(cents || 0) / 100);

function setActivePeriod() {
  document
    .querySelectorAll(".statistics-period")
    .forEach(button => {
      button.classList.toggle(
        "active",
        button.dataset.period === currentPeriod
      );
    });

  const label = $("statistics-period-label");

  if (label) {
    label.textContent =
      "Ventes en ligne — " +
      (PERIOD_LABELS[currentPeriod] || "Période");
  }
}

function renderChange(elementId, value) {
  const element = $(elementId);
  if (!element) return;

  const comparison =
    COMPARISON_LABELS[currentPeriod] || "";

  if (value === null || value === undefined) {
    element.textContent =
      "Nouvelle activité · " + comparison;
    element.className =
      "statistics-change statistics-change-neutral";
    return;
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    element.textContent = "";
    return;
  }

  const sign = number > 0 ? "+" : "";

  element.textContent =
    sign +
    number.toLocaleString("fr-FR", {
      maximumFractionDigits: 1
    }) +
    " % · " +
    comparison;

  element.className =
    "statistics-change " +
    (
      number > 0
        ? "statistics-change-up"
        : number < 0
          ? "statistics-change-down"
          : "statistics-change-neutral"
    );
}

async function loadStatistics() {
  $("statistics-loading").style.display = "block";
  $("statistics-content").style.display = "none";

  try {
    const response = await fetch(
      "/.netlify/functions/admin-statistics?period=" +
        encodeURIComponent(currentPeriod),
      {
        credentials: "same-origin",
        cache: "no-store"
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.error ||
        "Impossible de charger les statistiques."
      );
    }

    statisticsData = data;

    $("statistics-dashboard").style.display = "block";
    $("statistics-loading").style.display = "none";
    $("statistics-content").style.display = "block";

    setActivePeriod();
    renderStatistics();

  } catch (error) {
    $("statistics-loading").style.display = "none";
  }
}

function renderStatistics() {
  const summary = statisticsData.summary || {};
  const comparison = statisticsData.comparison || {};

  $("stat-revenue").textContent =
    euro(summary.revenue_cents);

  $("stat-orders").textContent =
    Number(summary.order_count || 0);

  $("stat-average").textContent =
    euro(summary.average_order_cents);

  $("stat-customers").textContent =
    Number(summary.customer_count || 0);

  renderChange(
    "stat-revenue-change",
    comparison.revenue_percent
  );

  renderChange(
    "stat-orders-change",
    comparison.orders_percent
  );

  renderChange(
    "stat-average-change",
    comparison.average_percent
  );

  renderChange(
    "stat-customers-change",
    comparison.customers_percent
  );

  renderAudience();
  renderFunnel();
  renderVisitorTypes();
  renderAudienceChart();
  renderTrafficSources();
  renderTopPages();
  renderDays();
  renderModes();
  renderProducts();
}


function renderAudience() {
  const audience = statisticsData.audience || {};
  const comparison =
    statisticsData.audience_comparison || {};

  $("stat-visitors").textContent =
    Number(audience.unique_visitors || 0)
      .toLocaleString("fr-FR");

  $("stat-sessions").textContent =
    Number(audience.sessions || 0)
      .toLocaleString("fr-FR");

  $("stat-pageviews").textContent =
    Number(audience.page_views || 0)
      .toLocaleString("fr-FR");

  $("stat-boutique-visitors").textContent =
    Number(audience.boutique_visitors || 0)
      .toLocaleString("fr-FR");

  renderChange(
    "stat-visitors-change",
    comparison.visitors_percent
  );

  renderChange(
    "stat-sessions-change",
    comparison.sessions_percent
  );

  renderChange(
    "stat-pageviews-change",
    comparison.page_views_percent
  );

  renderChange(
    "stat-boutique-visitors-change",
    comparison.boutique_visitors_percent
  );
}




function renderFunnel() {
  const audience =
    statisticsData.audience || {};

  const summary =
    statisticsData.summary || {};

  const visitors =
    Number(audience.unique_visitors || 0);

  const shopVisitors =
    Number(audience.boutique_visitors || 0);

  const orders =
    Number(summary.order_count || 0);

  const conversion =
    shopVisitors > 0
      ? (orders / shopVisitors) * 100
      : 0;

  $("funnel-visitors").textContent =
    visitors.toLocaleString("fr-FR");

  $("funnel-shop").textContent =
    shopVisitors.toLocaleString("fr-FR");

  $("funnel-orders").textContent =
    orders.toLocaleString("fr-FR");

  $("funnel-conversion").textContent =
    conversion.toLocaleString("fr-FR", {
      maximumFractionDigits: 1
    }) + " %";
}

function renderVisitorTypes() {
  const data =
    statisticsData.visitor_types || {};

  const newVisitors =
    Number(data.new_visitors || 0);

  const returningVisitors =
    Number(data.returning_visitors || 0);

  const total =
    newVisitors + returningVisitors;

  const newRate = total
    ? (newVisitors / total) * 100
    : 0;

  const returningRate = total
    ? (returningVisitors / total) * 100
    : 0;

  $("new-visitors").textContent =
    newVisitors.toLocaleString("fr-FR");

  $("returning-visitors").textContent =
    returningVisitors.toLocaleString("fr-FR");

  $("new-visitors-rate").textContent =
    newRate.toLocaleString("fr-FR", {
      maximumFractionDigits: 1
    }) + " %";

  $("returning-visitors-rate").textContent =
    returningRate.toLocaleString("fr-FR", {
      maximumFractionDigits: 1
    }) + " %";
}

function renderAudienceChart() {
  const rows =
    statisticsData.audience_by_day || [];

  const container = $("audience-chart");

  if (!rows.length) {
    container.innerHTML =
      '<div class="statistics-empty">' +
      "Aucune visite enregistrée sur cette période." +
      "</div>";
    return;
  }

  const maxViews = Math.max(
    ...rows.map(row =>
      Number(row.page_views || 0)
    ),
    1
  );

  container.innerHTML = rows.map(row => {
    const visitors =
      Number(row.unique_visitors || 0);

    const sessions =
      Number(row.sessions || 0);

    const views =
      Number(row.page_views || 0);

    const width =
      Math.max(4, (views / maxViews) * 100);

    let date = row.visit_date;

    try {
      date = new Intl.DateTimeFormat("fr-FR", {
        weekday: "short",
        day: "2-digit",
        month: "short"
      }).format(
        new Date(row.visit_date + "T12:00:00")
      );
    } catch {}

    return `
      <div class="statistics-day-row">
        <div class="statistics-day-info">
          <strong>${date}</strong>
          <span>
            ${visitors} visiteur${visitors > 1 ? "s" : ""}
            · ${sessions} visite${sessions > 1 ? "s" : ""}
          </span>
        </div>

        <div class="statistics-bar-area">
          <div class="statistics-bar">
            <div
              class="statistics-bar-fill"
              style="width:${width}%"
            ></div>
          </div>
        </div>

        <strong class="statistics-amount">
          ${views} vue${views > 1 ? "s" : ""}
        </strong>
      </div>
    `;
  }).join("");
}

function renderTrafficSources() {
  const rows =
    statisticsData.traffic_sources || [];

  const container = $("traffic-sources");

  if (!rows.length) {
    container.innerHTML =
      '<div class="statistics-empty">' +
      "Aucune provenance enregistrée sur cette période." +
      "</div>";
    return;
  }

  const labels = {
    google: "Google",
    instagram: "Instagram",
    facebook: "Facebook",
    direct: "Accès direct",
    other: "Autres"
  };

  container.innerHTML = rows.map(row => {
    const visitors =
      Number(row.unique_visitors || 0);

    const sessions =
      Number(row.sessions || 0);

    return `
      <div class="statistics-mode-row">
        <div>
          <strong>
            ${labels[row.source] || row.source}
          </strong>
          <span>
            ${sessions} visite${sessions > 1 ? "s" : ""}
          </span>
        </div>

        <strong>
          ${visitors} visiteur${visitors > 1 ? "s" : ""}
        </strong>
      </div>
    `;
  }).join("");
}

function renderTopPages() {
  const rows =
    statisticsData.top_pages || [];

  const container = $("top-pages");

  if (!rows.length) {
    container.innerHTML =
      '<div class="statistics-empty">' +
      "Aucune page consultée sur cette période." +
      "</div>";
    return;
  }

  const pageLabels = {
    "/": "Accueil",
    "/index.html": "Accueil",
    "/manger.html": "À manger",
    "/boissons.html": "Boissons",
    "/epicerie.html": "Épicerie",
    "/coffrets.html": "Coffrets",
    "/cadeaux.html": "Cadeaux",
    "/minargent.html": "Minargent",
    "/reservation.html": "Réservation",
    "/livraison.html": "Livraison",
    "/faq.html": "FAQ"
  };

  container.innerHTML = rows.map(row => {
    const views =
      Number(row.page_views || 0);

    const visitors =
      Number(row.unique_visitors || 0);

    const name =
      pageLabels[row.path] || row.path;

    return `
      <div class="statistics-mode-row">
        <div>
          <strong>${name}</strong>
          <span>
            ${visitors} visiteur${visitors > 1 ? "s" : ""}
          </span>
        </div>

        <strong>
          ${views} vue${views > 1 ? "s" : ""}
        </strong>
      </div>
    `;
  }).join("");
}

function renderDays() {
  const rows = statisticsData.by_day || [];
  const container = $("sales-by-day");

  if (!rows.length) {
    container.innerHTML =
      '<div class="statistics-empty">' +
      "Aucune vente enregistrée sur cette période." +
      "</div>";
    return;
  }

  const maxRevenue = Math.max(
    ...rows.map(row =>
      Number(row.revenue_cents || 0)
    ),
    1
  );

  container.innerHTML = rows.map(row => {
    const revenue =
      Number(row.revenue_cents || 0);

    const width =
      Math.max(4, (revenue / maxRevenue) * 100);

    const rawDate =
      row.sale_date || row.service_date;

    let date = rawDate;

    try {
      date = new Intl.DateTimeFormat("fr-FR", {
        weekday: "short",
        day: "2-digit",
        month: "short"
      }).format(
        new Date(rawDate + "T12:00:00")
      );
    } catch {}

    const orders =
      Number(row.order_count || 0);

    return `
      <div class="statistics-day-row">
        <div class="statistics-day-info">
          <strong>${date}</strong>
          <span>
            ${orders} commande${orders > 1 ? "s" : ""}
          </span>
        </div>

        <div class="statistics-bar-area">
          <div class="statistics-bar">
            <div
              class="statistics-bar-fill"
              style="width:${width}%"
            ></div>
          </div>
        </div>

        <strong class="statistics-amount">
          ${euro(revenue)}
        </strong>
      </div>
    `;
  }).join("");
}

function renderModes() {
  const rows = statisticsData.by_mode || [];
  const container = $("sales-by-mode");

  if (!rows.length) {
    container.innerHTML =
      '<div class="statistics-empty">' +
      "Aucune donnée sur cette période." +
      "</div>";
    return;
  }

  const labels = {
    pickup: "À emporter",
    delivery: "Livraison",
    unknown: "Autre"
  };

  container.innerHTML = rows.map(row => {
    const orders =
      Number(row.order_count || 0);

    return `
      <div class="statistics-mode-row">
        <div>
          <strong>
            ${labels[row.mode] || row.mode}
          </strong>
          <span>
            ${orders} commande${orders > 1 ? "s" : ""}
          </span>
        </div>

        <strong>
          ${euro(row.revenue_cents)}
        </strong>
      </div>
    `;
  }).join("");
}

function renderProducts() {
  const products =
    statisticsData.products || [];

  const container = $("top-products");

  if (!products.length) {
    container.innerHTML =
      '<div class="statistics-empty">' +
      "Aucun produit vendu sur cette période." +
      "</div>";
    return;
  }

  container.innerHTML =
    products.map((product, index) => {
      const quantity =
        Number(product.quantity || 0);

      return `
        <div class="statistics-product-row">
          <div class="statistics-product-rank">
            ${index + 1}
          </div>

          <div class="statistics-product-name">
            <strong>
              ${product.product_name}
            </strong>
            <span>
              ${quantity} vendu${quantity > 1 ? "s" : ""}
            </span>
          </div>

          <strong class="statistics-product-revenue">
            ${euro(product.revenue_cents)}
          </strong>
        </div>
      `;
    }).join("");
}





$("refresh-statistics").addEventListener(
  "click",
  () => loadStatistics()
);

document
  .querySelectorAll(".statistics-period")
  .forEach(button => {
    button.addEventListener("click", async () => {
      const period = button.dataset.period;

      if (!period || period === currentPeriod) {
        return;
      }

      currentPeriod = period;
      setActivePeriod();

      await loadStatistics();
    });
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
      await loadStatistics();
    }

  } catch (error) {
    console.error(
      "Session administrateur :",
      error
    );
  }
}

setActivePeriod();
initialiseAdminSession();
