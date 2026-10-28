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
    // Lets the /setup page confirm this worker is running and is pointed at a server.
    if (url.pathname === '/api/_proxy-check') return json({ worker: true, backendSet: /^https?:\/\//.test(String(env.BACKEND_URL || '')), secretSet: !!env.PROXY_SECRET }, 200);
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return proxy(request, env, url);
    const res = await env.ASSETS.fetch(request);
    // Single-page app: any page that isn't a file (e.g. /c/tmun27, /app/overview) gets index.html.
    if (res.status === 404 && !/\.[a-z0-9]{2,5}$/i.test(url.pathname)) return env.ASSETS.fetch(new Request(new URL('/', url), request));
    return res;
  },
};

const json = (o, status) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

async function proxy(request, env, url) {
  const backend = String(env.BACKEND_URL || '').replace(/\/+$/, '');
  if (!/^https?:\/\//.test(backend)) {
    return json({ error: 'The DelegateDesk server is not connected yet. In Cloudflare Pages → Settings → Variables and Secrets, set BACKEND_URL to your server address, then upload the site again. Open /setup to check.' }, 503);
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
    return json({ error: `The DelegateDesk server at ${backend} did not answer. It may be starting up (free hosting plans sleep); try again in a minute, or open /setup to check.` }, 502);
  }
  // The server always answers /api in JSON. A web page instead means BACKEND_URL points at the wrong address.
  const type = res.headers.get('content-type') || '';
  if (!type.includes('json') && !url.pathname.startsWith('/api/files') && !url.pathname.startsWith('/api/admin') && !url.pathname.startsWith('/api/finance') && !url.pathname.startsWith('/api/live/') && res.status >= 400) {
    return json({ error: `BACKEND_URL (${backend}) answered with a web page (${res.status}), not the DelegateDesk server. Check the address in Cloudflare Pages and open /setup.` }, 502);
  }
  const out = new Response(res.body, res);
  out.headers.set('x-dd-proxy', '1');
  // Keep redirects on this domain.
  const loc = out.headers.get('location');
  if (loc && loc.startsWith(backend)) out.headers.set('location', loc.slice(backend.length) || '/');
  out.headers.set('cache-control', out.headers.get('cache-control') || 'no-store');
  return out;
}
