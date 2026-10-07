const reply = (data, status = 200) =>
    Response.json(data, {
        status,
        headers: { "Cache-Control": "no-store" }
    });

export default async (req) => {
    if (req.method !== "GET") {
        return reply({ error: "Method not allowed" }, 405);
    }

    const publicKey = process.env.VAPID_PUBLIC_KEY;

    if (!publicKey) {
        return reply({ error: "VAPID_PUBLIC_KEY non configurée." }, 500);
    }

    return reply({ publicKey });
};
