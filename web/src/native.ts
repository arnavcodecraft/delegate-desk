/**
 * Running inside the DelegateDesk apps. The website itself ships in the app, so it opens straight onto the home page;
 * only server calls (/api, /uploads) go to the DelegateDesk server: set when the app was built, or in App settings.
 *  - Android: calls are sent to the server address (Capacitor's native HTTP keeps the sign-in cookies).
 *  - Desktop: the app passes them on itself, so nothing changes here.
 */
declare global { interface Window { DD_NATIVE?: 'android' | 'desktop'; DD_API?: string; dd?: { setServer?: (u: string) => void; server?: () => Promise<string> } } }

const KEY = 'dd-server-url';
export const nativeApp = typeof window !== 'undefined' ? window.DD_NATIVE ?? null : null;
export function serverUrl(): string {
  let saved = '';
  try { saved = localStorage.getItem(KEY) ?? ''; } catch { /* private mode */ }
  return (saved || window.DD_API || '').replace(/\/+$/, '');
}
export function normaliseServer(v: string): string | null {
  let s = String(v ?? '').trim();
  if (!s) return '';
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  try { const u = new URL(s); if (u.protocol !== 'https:' && !/^(localhost|127\.|192\.168\.|10\.)/.test(u.hostname)) return null; return u.origin; } catch { return null; }
}
export function saveServer(url: string) {
  try { if (url) localStorage.setItem(KEY, url); else localStorage.removeItem(KEY); } catch { /* private mode */ }
  window.dd?.setServer?.(url);
}
/** True when the app has no server to talk to yet. */
export const needsServer = () => nativeApp === 'android' && !serverUrl();

export function installNativeFetch() {
  if (nativeApp !== 'android') return;
  const send = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof input === 'string' && /^\/(api|uploads)\//.test(input)) {
      const base = serverUrl();
      if (!base) return Promise.reject(new TypeError('No DelegateDesk server set'));
      return send(base + input, { ...init, credentials: 'include' });
    }
    return send(input, init);
  };
}
