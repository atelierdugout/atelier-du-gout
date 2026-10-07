import { hasAdminAccess } from "./admin-session.mjs";

const API_BASE = "https://api.hygiene-expert.com";
const SITE_ID = 15651;
const GROUP_ID = 7471;

const reply = (data, status = 200) =>
  Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });

async function hygieneExpertGet(path, params = {}) {
  const token = process.env.HYGIENE_EXPERT_HACCP_TOKEN;

  if (!token) {
    throw new Error("HYGIENE_EXPERT_HACCP_TOKEN non configuré.");
  }

  const url = new URL(`${API_BASE}${path}`);

  url.searchParams.set("token", token);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url, {
    headers: {
      Accept: "application/json"
    }
  });

  const text = await response.text();

  let data;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    console.error(
      `Hygiène Expert ${path}:`,
      response.status,
      data
    );

    throw new Error(
      `Hygiène Expert a répondu HTTP ${response.status}.`
    );
  }

  return data;
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
    const now = new Date();

    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    const common = {
      entityType: 2,
      entityId: SITE_ID,
      yearStart: year,
      yearEnd: year
    };

    const [
      entityInfo,
      overview,
      activity,
      tasks,
      nonConformingTemperatures,
      conformityByModule
    ] = await Promise.all([
      hygieneExpertGet(
        "/stats/haccp/entity-info"
      ),

      hygieneExpertGet(
        "/stats/haccp/overview",
        {
          ...common,
          typeDate: "month",
          startTypeDate: month,
          endTypeDate: month
        }
      ),

      hygieneExpertGet(
        "/stats/haccp/global-modules-monthly-activity",
        {
          ...common,
          monthStart: month,
          monthEnd: month
        }
      ),

      hygieneExpertGet(
        "/stats/haccp/tasks",
        {
          ...common,
          typeDate: "month",
          startTypeDate: month,
          endTypeDate: month
        }
      ),

      hygieneExpertGet(
        "/stats/haccp/nc-temperatures",
        {
          ...common,
          typeDate: "month",
          startTypeDate: month,
          endTypeDate: month
        }
      ),

      hygieneExpertGet(
        "/stats/haccp/conformity-by-module-monthly",
        {
          ...common,
          monthStart: month,
          monthEnd: month
        }
      )
    ]);

    const moduleActivity =
      activity?.ViewAGGlobalModulesActivityList || [];

    const activeModules = moduleActivity.filter(
      item => Number(item?.Value || 0) > 0
    );

    const totalActivity = moduleActivity.reduce(
      (sum, item) => sum + Number(item?.Value || 0),
      0
    );

    return reply({
      status: "ready",
      source: "hygiene-expert",

      hygieneExpert: {
        connected: true,
        client: "L'ATELIER DU GOUT",
        groupId: GROUP_ID,
        siteId: SITE_ID,
        period: {
          year,
          month
        }
      },

      summary: {
        totalActivity,
        activeModules: activeModules.length,
        modulesAvailable: moduleActivity.length
      },

      entityInfo,
      overview,
      activity,
      tasks,
      nonConformingTemperatures,
      conformityByModule,

      alerts: totalActivity === 0
        ? [{
            type: "info",
            code: "NO_HACCP_ACTIVITY",
            message:
              "Aucune activité HACCP enregistrée dans Hygiène Expert pour la période en cours."
          }]
        : []
    });

  } catch (error) {
    console.error("admin-hygiene:", error);

    return reply({
      status: "error",
      source: "hygiene-expert",
      hygieneExpert: {
        connected: false
      },
      error:
        "Impossible de charger les données Hygiène Expert."
    }, 500);
  }
};
