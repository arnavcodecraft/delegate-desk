/**
 * DelegateDesk on Cloudflare Pages (advanced mode).
 *
 * Pages serves the web app (index.html and /assets). Everything under /api is forwarded to the DelegateDesk
 * server, whose address is set in the Pages project as the environment variable BACKEND_URL
 * (for example https://delegatedesk-api.onrender.com or a Cloudflare Tunnel hostname).
 * Because the browser only ever talks to this one domain, sign-in cookies stay first-party.
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return proxy(request, env, url);
    const res = await env.ASSETS.fetch(request);
    // Single-page app: any page that isn't a file (e.g. /c/tmun27, /app/overview) gets index.html.
    if (res.status === 404 && !/\.[a-z0-9]{2,5}$/i.test(url.pathname)) return env.ASSETS.fetch(new Request(new URL('/', url), request));
    return res;
  },
};

async function proxy(request, env, url) {
  const backend = String(env.BACKEND_URL || '').replace(/\/+$/, '');
  if (!/^https?:\/\//.test(backend)) {
    return new Response(JSON.stringify({ error: 'The DelegateDesk server is not connected yet. In Cloudflare Pages, set the BACKEND_URL variable and redeploy.' }), { status: 503, headers: { 'content-type': 'application/json' } });
  }
  const target = new URL(url.pathname + url.search, backend);
  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.set('x-forwarded-host', url.host);
  headers.set('x-forwarded-proto', url.protocol.replace(':', ''));
  const ip = request.headers.get('cf-connecting-ip');
  if (ip) headers.set('x-forwarded-for', ip);
  if (env.PROXY_SECRET) headers.set('x-proxy-secret', env.PROXY_SECRET);
  let res;
  try {
    res = await fetch(target, {
      method: request.method, headers, redirect: 'manual',
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'The DelegateDesk server did not answer. It may be starting up; try again in a minute.' }), { status: 502, headers: { 'content-type': 'application/json' } });
  }
  const out = new Response(res.body, res);
  // Keep redirects on this domain.
  const loc = out.headers.get('location');
  if (loc && loc.startsWith(backend)) out.headers.set('location', loc.slice(backend.length) || '/');
  out.headers.set('cache-control', out.headers.get('cache-control') || 'no-store');
  return out;
}
