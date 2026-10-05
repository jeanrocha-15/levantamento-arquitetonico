// Preferência de tema (Claro / Escuro / Sistema). É preferência do aparelho, não dado do levantamento.
export type ThemePreference = 'light' | 'dark' | 'system'
export const themeNames: Record<ThemePreference, string> = { system: 'Sistema', light: 'Claro', dark: 'Escuro' }
const KEY = 'campo-theme-v1'
export const isTheme = (value: unknown): value is ThemePreference => value === 'light' || value === 'dark' || value === 'system'
export function loadTheme(): ThemePreference { try { const value = localStorage.getItem(KEY); return isTheme(value) ? value : 'system' } catch { return 'system' } }
export function saveTheme(theme: ThemePreference) { try { localStorage.setItem(KEY, theme) } catch { /* sem armazenamento: vale só nesta sessão */ } }
export function resolvedTheme(theme: ThemePreference, prefersDark = typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches): 'light' | 'dark' {
  return theme === 'system' ? (prefersDark ? 'dark' : 'light') : theme
}
export function applyTheme(theme: ThemePreference, root: HTMLElement = document.documentElement) {
  root.dataset.theme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolvedTheme(theme) === 'dark' ? '#121821' : '#0F2747')
}
