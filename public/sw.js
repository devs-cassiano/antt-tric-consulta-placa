/* ANTT TRIC — Service Worker (App Shell + Network First para /api/*) */
const CACHE_VERSION = "antt-tric-v1";
const APP_SHELL = [
  "/",
  "/index.html",
  "/config.js",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-192-maskable.png",
  "/icons/icon-512-maskable.png",
  "/icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

function isApiRequest(url) {
  return url.pathname.startsWith("/api/");
}

function isNavigationRequest(request) {
  return request.mode === "navigate";
}

async function networkFirstApi(request) {
  try {
    const response = await fetch(request);
    return response;
  } catch (error) {
    return new Response(
      JSON.stringify({
        sucesso: false,
        mensagem:
          "Sem conexão com a rede. A consulta TRIC exige acesso à internet para consultar o portal da ANTT em tempo real.",
        dados_veiculo: {
          placa: "",
          tipo: "",
          modelo: "",
          chassi_motor: "",
          ccu: "",
          marca: "",
          eixos: "",
          ano: "",
        },
        dados_empresa: {
          razao_social: "",
          nome_fantasia: "",
          endereco: "",
          bairro: "",
          cidade: "",
          pais_origem: "",
        },
        situacao_licencas: [],
      }),
      {
        status: 503,
        statusText: "Service Unavailable",
        headers: { "Content-Type": "application/json; charset=utf-8" },
      }
    );
  }
}

async function cacheFirstShell(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response && response.ok && request.method === "GET") {
      const copy = response.clone();
      const cache = await caches.open(CACHE_VERSION);
      cache.put(request, copy);
    }
    return response;
  } catch (error) {
    if (isNavigationRequest(request)) {
      const fallback = await caches.match("/index.html");
      if (fallback) return fallback;
    }
    throw error;
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Apenas same-origin; CDNs externas (jsPDF, fonts) ficam na rede
  if (url.origin !== self.location.origin) return;

  if (isApiRequest(url)) {
    event.respondWith(networkFirstApi(request));
    return;
  }

  event.respondWith(cacheFirstShell(request));
});
