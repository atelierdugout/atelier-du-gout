self.addEventListener("install", () => {
    self.skipWaiting();
});

self.addEventListener("activate", event => {
    event.waitUntil(self.clients.claim());
});

self.addEventListener("push", event => {
    const data = event.data ? event.data.json() : {};

    event.waitUntil(
        self.registration.showNotification(
            data.title || "L'Atelier du Goût",
            {
                body: data.body || "Nouvelle commande reçue",
                icon: "/admin/icon-192.png",
                badge: "/admin/icon-192.png",
                data: {
                    url: data.url || "/admin/commandes.html"
                }
            }
        )
    );
});

self.addEventListener("notificationclick", event => {
    event.notification.close();
    event.waitUntil(
        clients.openWindow(event.notification.data?.url || "/admin/commandes.html")
    );
});
