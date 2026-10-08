// Development previews never reuse the stable site's projects or photo files.
export const isDevPreview = import.meta.env?.VITE_APP_CHANNEL === 'dev'
export const storagePrefix = isDevPreview ? 'lac-dev-' : ''
export const appCachePrefix = isDevPreview ? 'lac-dev-app-' : 'campo-app-'
