// Service worker de Vantia -- únicamente para notificaciones push del
// navegador. No cachea nada (no es un service worker de "app offline"): su
// único trabajo es despertar cuando llega un push y mostrar el aviso, y abrir
// (o enfocar) la app al hacer clic en él.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { /* noop */ }

  const title = payload.title || "Vantia";
  const options = {
    body: payload.body || "",
    icon: "/vantia-mark-192.png",
    badge: "/vantia-mark-96.png",
    tag: payload.tag || undefined,
    renotify: Boolean(payload.tag),
    data: { url: payload.url || "/dashboard", dismissUrl: payload.dismissUrl || null },
    // Solo los avisos de plazo (los que llevan dismissUrl) ofrecen este
    // botón -- silencia ESE aviso concreto sin tener que completar la tarea.
    actions: payload.dismissUrl ? [{ action: "dismiss-plazo", title: "No volver a avisar" }] : undefined,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  const dismissUrl = event.notification.data?.dismissUrl;

  if (event.action === "dismiss-plazo" && dismissUrl) {
    event.notification.close();
    // fetch en segundo plano -- no hace falta abrir ni enfocar la app para
    // esta acción, el propio token del enlace autoriza la llamada.
    event.waitUntil(fetch(dismissUrl, { method: "POST" }).catch(() => {}));
    return;
  }

  event.notification.close();
  const targetUrl = event.notification.data?.url || "/dashboard";

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of allClients) {
        const clientUrl = new URL(client.url);
        if (clientUrl.origin === self.location.origin && "focus" in client) {
          await client.focus();
          if ("navigate" in client) await client.navigate(targetUrl);
          return;
        }
      }
      await self.clients.openWindow(targetUrl);
    })(),
  );
});
