import { db } from "./db.mjs";
import { hasAdminAccess } from "./admin-session.mjs";

const VALID_STATUSES = [
  "paid",
  "preparing",
  "ready",
  "completed"
];

const VALID_PERIODS = new Set([
  "today",
  "7d",
  "month",
  "last_month",
  "year"
]);

const reply = (data, status = 200) =>
  Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });

function parisParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);

  const get = type =>
    Number(parts.find(part => part.type === type)?.value);

  return {
    year: get("year"),
    month: get("month"),
    day: get("day")
  };
}

function parisMidnightUtc(year, month, day) {
  const probe = new Date(
    Date.UTC(year, month - 1, day, 12, 0, 0)
  );

  const offsetName = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Paris",
    timeZoneName: "longOffset"
  })
    .formatToParts(probe)
    .find(part => part.type === "timeZoneName")
    ?.value || "GMT+00:00";

  const match = offsetName.match(
    /GMT([+-])(\d{2}):(\d{2})/
  );

  let offsetMinutes = 0;

  if (match) {
    const sign = match[1] === "+" ? 1 : -1;
    offsetMinutes =
      sign * (Number(match[2]) * 60 + Number(match[3]));
  }

  return new Date(
    Date.UTC(year, month - 1, day, 0, 0, 0) -
    offsetMinutes * 60_000
  );
}

function addCalendarDays(parts, days) {
  const d = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day)
  );

  d.setUTCDate(d.getUTCDate() + days);

  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate()
  };
}

function addCalendarMonths(parts, months) {
  const d = new Date(
    Date.UTC(parts.year, parts.month - 1 + months, 1)
  );

  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: 1
  };
}

function rangeForPeriod(period) {
  const today = parisParts();

  let startParts;
  let endParts;
  let previousStartParts;
  let previousEndParts;

  if (period === "today") {
    startParts = today;
    endParts = addCalendarDays(today, 1);
    previousStartParts = addCalendarDays(today, -1);
    previousEndParts = today;
  } else if (period === "7d") {
    endParts = addCalendarDays(today, 1);
    startParts = addCalendarDays(endParts, -7);
    previousEndParts = startParts;
    previousStartParts = addCalendarDays(
      previousEndParts,
      -7
    );
  } else if (period === "last_month") {
    endParts = {
      ...addCalendarMonths(today, 0),
      day: 1
    };
    startParts = addCalendarMonths(endParts, -1);
    previousEndParts = startParts;
    previousStartParts = addCalendarMonths(
      previousEndParts,
      -1
    );
  } else if (period === "year") {
    startParts = {
      year: today.year,
      month: 1,
      day: 1
    };
    endParts = {
      year: today.year + 1,
      month: 1,
      day: 1
    };
    previousStartParts = {
      year: today.year - 1,
      month: 1,
      day: 1
    };
    previousEndParts = startParts;
  } else {
    startParts = {
      year: today.year,
      month: today.month,
      day: 1
    };
    endParts = addCalendarMonths(startParts, 1);
    previousEndParts = startParts;
    previousStartParts = addCalendarMonths(
      startParts,
      -1
    );
  }

  return {
    start: parisMidnightUtc(
      startParts.year,
      startParts.month,
      startParts.day
    ),
    end: parisMidnightUtc(
      endParts.year,
      endParts.month,
      endParts.day
    ),
    previousStart: parisMidnightUtc(
      previousStartParts.year,
      previousStartParts.month,
      previousStartParts.day
    ),
    previousEnd: parisMidnightUtc(
      previousEndParts.year,
      previousEndParts.month,
      previousEndParts.day
    )
  };
}

function percentageChange(current, previous) {
  current = Number(current || 0);
  previous = Number(previous || 0);

  if (previous === 0) {
    return current === 0 ? 0 : null;
  }

  return Number(
    (((current - previous) / previous) * 100).toFixed(1)
  );
}

export default async req => {
  if (!hasAdminAccess(req)) {
    return reply({
      error: "Authentification administrateur requise."
    }, 401);
  }

  if (req.method !== "GET") {
    return reply({
      error: "Méthode non autorisée."
    }, 405);
  }

  try {
    const url = new URL(req.url);
    const requestedPeriod =
      url.searchParams.get("period") || "month";

    const period = VALID_PERIODS.has(requestedPeriod)
      ? requestedPeriod
      : "month";

    const {
      start,
      end,
      previousStart,
      previousEnd
    } = rangeForPeriod(period);

    const sql = db();

    const currentSummary = (await sql`
      SELECT
        COUNT(*)::int AS order_count,
        COALESCE(SUM(total_cents), 0)::bigint
          AS revenue_cents,
        COALESCE(AVG(total_cents), 0)::numeric
          AS average_order_cents,
        COUNT(
          DISTINCT LOWER(TRIM(customer_email))
        )::int AS customer_count
      FROM orders
      WHERE status = ANY(${VALID_STATUSES})
        AND paid_at >= ${start}
        AND paid_at < ${end}
    `)[0];

    const previousSummary = (await sql`
      SELECT
        COUNT(*)::int AS order_count,
        COALESCE(SUM(total_cents), 0)::bigint
          AS revenue_cents,
        COALESCE(AVG(total_cents), 0)::numeric
          AS average_order_cents,
        COUNT(
          DISTINCT LOWER(TRIM(customer_email))
        )::int AS customer_count
      FROM orders
      WHERE status = ANY(${VALID_STATUSES})
        AND paid_at >= ${previousStart}
        AND paid_at < ${previousEnd}
    `)[0];

    const byDay = await sql`
      SELECT
        TO_CHAR(
          paid_at AT TIME ZONE 'Europe/Paris',
          'YYYY-MM-DD'
        ) AS sale_date,
        COUNT(*)::int AS order_count,
        COALESCE(SUM(total_cents), 0)::bigint
          AS revenue_cents
      FROM orders
      WHERE status = ANY(${VALID_STATUSES})
        AND paid_at >= ${start}
        AND paid_at < ${end}
      GROUP BY sale_date
      ORDER BY sale_date
    `;

    const byMode = await sql`
      SELECT
        COALESCE(mode, 'unknown') AS mode,
        COUNT(*)::int AS order_count,
        COALESCE(SUM(total_cents), 0)::bigint
          AS revenue_cents
      FROM orders
      WHERE status = ANY(${VALID_STATUSES})
        AND paid_at >= ${start}
        AND paid_at < ${end}
      GROUP BY mode
      ORDER BY revenue_cents DESC
    `;

    const products = await sql`
      SELECT
        oi.product_name,
        COALESCE(SUM(oi.quantity), 0)::int
          AS quantity,
        COALESCE(
          SUM(oi.line_total_cents),
          0
        )::bigint AS revenue_cents
        , COUNT(*) OVER()::int AS distinct_product_count
        , SUM(SUM(oi.line_total_cents)) OVER()::bigint AS total_product_revenue_cents
      FROM order_items oi
      JOIN orders o
        ON o.id = oi.order_id
      WHERE o.status = ANY(${VALID_STATUSES})
        AND o.paid_at >= ${start}
        AND o.paid_at < ${end}
      GROUP BY oi.product_name
      ORDER BY quantity DESC, revenue_cents DESC
      LIMIT 20
    `;


    const audienceSummary = (await sql`
      SELECT
        COUNT(DISTINCT visitor_id)::int AS unique_visitors,
        COUNT(DISTINCT session_id)::int AS sessions,
        COUNT(*)::int AS page_views,
        COUNT(
          DISTINCT visitor_id
        ) FILTER (
          WHERE section = 'boutique'
        )::int AS boutique_visitors
      FROM site_analytics
      WHERE created_at >= ${start}
        AND created_at < ${end}
    `)[0];

    const previousAudienceSummary = (await sql`
      SELECT
        COUNT(DISTINCT visitor_id)::int AS unique_visitors,
        COUNT(DISTINCT session_id)::int AS sessions,
        COUNT(*)::int AS page_views,
        COUNT(
          DISTINCT visitor_id
        ) FILTER (
          WHERE section = 'boutique'
        )::int AS boutique_visitors
      FROM site_analytics
      WHERE created_at >= ${previousStart}
        AND created_at < ${previousEnd}
    `)[0];



    const visitorTypes = (await sql`
      WITH visitors AS (
        SELECT
          visitor_id,
          MIN(created_at) AS first_visit,
          MAX(created_at) FILTER (
            WHERE created_at >= ${start}
              AND created_at < ${end}
          ) AS visit_in_period
        FROM site_analytics
        WHERE created_at < ${end}
        GROUP BY visitor_id
      )
      SELECT
        COUNT(*) FILTER (
          WHERE visit_in_period IS NOT NULL
            AND first_visit >= ${start}
        )::int AS new_visitors,

        COUNT(*) FILTER (
          WHERE visit_in_period IS NOT NULL
            AND first_visit < ${start}
        )::int AS returning_visitors
      FROM visitors
    `)[0];

    const audienceByDay = await sql`
      SELECT
        TO_CHAR(
          created_at AT TIME ZONE 'Europe/Paris',
          'YYYY-MM-DD'
        ) AS visit_date,
        COUNT(DISTINCT visitor_id)::int
          AS unique_visitors,
        COUNT(DISTINCT session_id)::int
          AS sessions,
        COUNT(*)::int
          AS page_views,
        COUNT(
          DISTINCT visitor_id
        ) FILTER (
          WHERE section = 'boutique'
        )::int AS boutique_visitors
      FROM site_analytics
      WHERE created_at >= ${start}
        AND created_at < ${end}
      GROUP BY visit_date
      ORDER BY visit_date
    `;

    const trafficSources = await sql`
      SELECT
        source,
        COUNT(DISTINCT visitor_id)::int
          AS unique_visitors,
        COUNT(DISTINCT session_id)::int
          AS sessions,
        COUNT(*)::int AS page_views
      FROM site_analytics
      WHERE created_at >= ${start}
        AND created_at < ${end}
      GROUP BY source
      ORDER BY unique_visitors DESC, page_views DESC
    `;

    const topPages = await sql`
      SELECT
        path,
        section,
        COUNT(DISTINCT visitor_id)::int
          AS unique_visitors,
        COUNT(*)::int AS page_views
      FROM site_analytics
      WHERE created_at >= ${start}
        AND created_at < ${end}
      GROUP BY path, section
      ORDER BY page_views DESC
      LIMIT 20
    `;

    const productMetrics = {
      distinct_products: products[0]?.distinct_product_count ?? 0,
      total_product_revenue_cents: products[0]?.total_product_revenue_cents ?? 0,
      top_by_revenue: [...products].sort((a, b) => Number(b.revenue_cents) - Number(a.revenue_cents))[0]?.product_name ?? null,
      top_by_quantity: [...products].sort((a, b) => Number(b.quantity) - Number(a.quantity))[0]?.product_name ?? null
    };
    const comparison = {
      revenue_percent: percentageChange(
        currentSummary.revenue_cents,
        previousSummary.revenue_cents
      ),
      orders_percent: percentageChange(
        currentSummary.order_count,
        previousSummary.order_count
      ),
      average_percent: percentageChange(
        currentSummary.average_order_cents,
        previousSummary.average_order_cents
      ),
      customers_percent: percentageChange(
        currentSummary.customer_count,
        previousSummary.customer_count
      )
    };

    return reply({
      ok: true,
      period,
      range: {
        start: start.toISOString(),
        end: end.toISOString(),
        previous_start: previousStart.toISOString(),
        previous_end: previousEnd.toISOString()
      },
      summary: currentSummary,
      previous_summary: previousSummary,
      comparison,
      by_day: byDay,
      by_mode: byMode,
      products,
      product_metrics: productMetrics,
      audience: audienceSummary,
      previous_audience: previousAudienceSummary,
      audience_comparison: {
        visitors_percent: percentageChange(
          audienceSummary.unique_visitors,
          previousAudienceSummary.unique_visitors
        ),
        sessions_percent: percentageChange(
          audienceSummary.sessions,
          previousAudienceSummary.sessions
        ),
        page_views_percent: percentageChange(
          audienceSummary.page_views,
          previousAudienceSummary.page_views
        ),
        boutique_visitors_percent: percentageChange(
          audienceSummary.boutique_visitors,
          previousAudienceSummary.boutique_visitors
        )
      },
      visitor_types: visitorTypes,
      audience_by_day: audienceByDay,
      traffic_sources: trafficSources,
      top_pages: topPages
    });

  } catch (error) {
    console.error("admin-statistics:", error);

    return reply({
      error: "Impossible de charger les statistiques."
    }, 500);
  }
};
