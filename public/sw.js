// Service worker do LAC: permite abrir a aplicação sem conexão (uso em campo).
// Os dados dos levantamentos ficam no IndexedDB; aqui só são guardados os arquivos da aplicação.
const scope = new URL(self.registration.scope)
const PREFIX = scope.pathname.endsWith('/dev/') ? 'lac-dev-app-' : 'campo-app-'
const CACHE = `${PREFIX}v5-preview`
const isIndex = url => url.pathname === scope.pathname || url.pathname === `${scope.pathname}index.html`
const isAsset = url => url.pathname.startsWith(`${scope.pathname}assets/`)
const isStatic = url => /\/(lac-[\w-]+\.(?:svg|png|ico)|favicon\.(?:svg|ico)|manifest\.webmanifest|icon-[\w-]+\.png|apple-touch-icon\.png)$/.test(url.pathname)

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', event => event.waitUntil((async () => {
  for (const key of await caches.keys()) if (key.startsWith(PREFIX) && key !== CACHE) await caches.delete(key)
  await self.clients.claim()
})()))

async function put(request, response) {
  // Respostas redirecionadas (ex.: tela de login) ou com erro nunca entram no cache.
  if (!response || !response.ok || response.redirected || response.type !== 'basic') return
  const cache = await caches.open(CACHE)
  await cache.put(request, response.clone())
}
async function networkFirst(request) {
  try {
    const response = await fetch(request)
    if (response.ok && !response.redirected) await put(new Request(scope.href), response.clone())
    return response
  } catch {
    const cached = await caches.match(scope.href)
    if (cached) return cached
    return new Response('<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>LAC</title><body style="font-family:system-ui;padding:32px;color:#16202B"><h1>Sem conexão</h1><p>Abra o LAC uma vez com internet para usá-lo depois sem conexão.</p><button onclick="location.reload()">Tentar novamente</button></body></html>', { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
  }
}
async function cacheFirst(request) {
  const cached = await caches.match(request)
  if (cached) return cached
  const response = await fetch(request)
  await put(request, response)
  return response
}
async function staleWhileRevalidate(request) {
  const cached = await caches.match(request)
  const network = fetch(request).then(async response => { await put(request, response); return response }).catch(() => cached)
  return cached ?? network
}

self.addEventListener('fetch', event => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return
  if (request.mode === 'navigate' && isIndex(url)) event.respondWith(networkFirst(request))
  else if (isAsset(url)) event.respondWith(cacheFirst(request))
  else if (isStatic(url)) event.respondWith(staleWhileRevalidate(request))
  // Demais endereços (API, login, administração) seguem direto para a rede.
})
