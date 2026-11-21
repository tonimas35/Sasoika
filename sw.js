// Service worker mínimo: permite instalar la app en el móvil. Siempre va a la red.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
