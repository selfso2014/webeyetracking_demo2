/* js/coi-serviceworker.js
   Cross-Origin Isolation for static hosting (e.g., GitHub Pages) via Service Worker.
   This enables SharedArrayBuffer in browsers that require COOP/COEP headers.

   Reference pattern widely used for GitHub Pages deployments.
*/
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  event.respondWith((async () => {
    const response = await fetch(event.request);

    // If response is opaque (cross-origin without CORS), we cannot clone/modify headers.
    // Return as-is.
    if (response.type === "opaque") return response;

    const newHeaders = new Headers(response.headers);
    // COOP + COEP => crossOriginIsolated === true (in supporting browsers)
    newHeaders.set("Cross-Origin-Opener-Policy", "same-origin");
    // credentialless is often more permissive for third-party assets; require-corp is stricter.
    newHeaders.set("Cross-Origin-Embedder-Policy", "credentialless");

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });
  })());
});
