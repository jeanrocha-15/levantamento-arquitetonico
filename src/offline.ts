import { appCachePrefix } from './releaseChannel'
// Registra o service worker em produção (HTTPS ou localhost) para abrir a aplicação sem conexão.
export function registerOffline() {
  const secure = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1'
  if (!import.meta.env.PROD || !secure || !('serviceWorker' in navigator)) return
  window.addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').catch(error => console.warn('Uso sem conexão indisponível neste navegador.', error)) })
}
// Remove os arquivos guardados (ex.: ao sair de uma conta em aparelho compartilhado).
export async function clearOfflineCache() {
  try { for (const key of await caches.keys()) if (key.startsWith(appCachePrefix)) await caches.delete(key) } catch { /* sem Cache Storage */ }
}
