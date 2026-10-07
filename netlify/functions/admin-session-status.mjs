import {
  hasValidAdminSession,
  clearAdminSessionCookie
} from "./admin-session.mjs";

const reply = (data, status = 200, headers = {}) =>
  Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      ...headers
    }
  });

export default async (req) => {
  if (req.method === "GET") {
    return reply({
      authenticated: hasValidAdminSession(req)
    });
  }

  if (req.method === "DELETE") {
    return reply(
      {
        success: true,
        authenticated: false
      },
      200,
      {
        "Set-Cookie": clearAdminSessionCookie()
      }
    );
  }

  return reply({ error: "Méthode non autorisée." }, 405);
};
