import { needsServer } from './native';
export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: any) { super(message); }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const isForm = body instanceof FormData;
  let res: Response;
  try {
    res = await fetch(url, {
      method, credentials: 'same-origin',
      headers: { ...(isForm || body === undefined ? {} : { 'content-type': 'application/json' }), 'x-dd': '1' },
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    });
  } catch {
    // The browser got no answer at all ("Failed to fetch"): the server is stopped or this device is offline.
    if (needsServer()) throw new ApiError(0, 'This app is not connected to a DelegateDesk server yet. Open the menu, then App settings, and enter your server address.');
    const local = /^(localhost|127\.|192\.168\.|10\.)/.test(window.location.hostname);
    throw new ApiError(0, navigator.onLine === false ? 'You are offline. Check your internet connection and try again.'
      : local ? 'The DelegateDesk server is not running. Open the DelegateDesk folder, double-click start.bat, keep that black window open, then try again.'
        : 'Could not reach the DelegateDesk server. Check your connection and try again in a moment. If you run this site, open /setup.');
  }
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  // The DelegateDesk server always answers in JSON. A web page instead means the site isn't connected to it.
  const notServer = url.startsWith('/api/') && typeof data === 'string' && /<!doctype html|<html/i.test(data);
  if (notServer || (!res.ok && url.startsWith('/api/') && (data === null || typeof data === 'string') && [404, 405, 502, 503].includes(res.status))) {
    throw new ApiError(res.status || 503, 'This site can’t reach the DelegateDesk server, so nothing can be saved. If you run the site, open /setup to see what to fix.');
  }
  if (!res.ok) {
    if (res.status === 401 && url.startsWith('/api/') && !url.startsWith('/api/auth') && !url.startsWith('/api/public')) window.dispatchEvent(new CustomEvent('dd:unauthorised', { detail: data }));
    throw new ApiError(res.status, data?.error ?? `Request failed (${res.status})`, data?.details);
  }
  return data as T;
}

export const api = {
  get: <T = any>(url: string) => request<T>('GET', url),
  post: <T = any>(url: string, body: unknown = {}) => request<T>('POST', url, body),
  patch: <T = any>(url: string, body: unknown) => request<T>('PATCH', url, body),
  put: <T = any>(url: string, body: unknown) => request<T>('PUT', url, body),
  del: <T = any>(url: string) => request<T>('DELETE', url),
};

export const qs = (o: Record<string, unknown>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== '') p.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
};
