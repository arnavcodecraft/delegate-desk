# Putting DelegateDesk on Cloudflare

DelegateDesk has two halves:

| Half | What it is | Where it runs |
|---|---|---|
| **Website** | The pages people see (`index.html`, `assets/`) plus a small `_worker.js` | **Cloudflare Pages**: `DelegateDesk-cloudflare-pages.zip` (157 files, under the 1,000-file limit) |
| **Server** | The database, payments, emails, uploads, PDFs, live sessions | A Node.js host: Render, a VPS, or your own PC through Cloudflare Tunnel (`DelegateDesk-server.zip`) |

Cloudflare Pages only hosts files. It cannot run the database or the server, so the website forwards every `/api` request to the server. People only ever see your Cloudflare address, so sign-in cookies, uploads and downloads all work as normal. This exact setup passes the full 41-step end-to-end test.

---

## Step 1: run the server (pick one)

### A. Render (simplest, about $7 a month for the disk)
1. Put the contents of `DelegateDesk-server.zip` in a GitHub repository.
2. On render.com, go to **New → Blueprint** and choose the repository. It reads `render.yaml`: Docker, a 1 GB disk for the database and uploads, and a health check.
3. When it asks for variables, fill them in (you can come back for `BASE_URL`):
   - `PROXY_SECRET`: any long random text. You will paste the same value into Cloudflare.
   - `BASE_URL`: your Pages address, e.g. `https://delegatedesk.pages.dev`.
   - Optional: `SMTP_URL` for real emails, `ANTHROPIC_API_KEY` for AI in Prep.
4. Note the server address Render gives you, e.g. `https://delegatedesk-api.onrender.com`.

### B. Your own Windows PC with Cloudflare Tunnel (free; the PC must stay on)
1. Unzip `DelegateDesk-server.zip` and create a file called `.env` next to `start.bat`:
   ```
   BASE_URL=https://delegatedesk.pages.dev
   PROXY_SECRET=paste-a-long-random-text
   TRUST_PROXY=2
   APP_SECRET=another-long-random-text
   ```
2. Double-click `start.bat`. The server runs on `http://localhost:8080`.
3. Install `cloudflared` (Cloudflare Zero Trust → Networks → Tunnels → Create a tunnel) and point a public hostname, e.g. `api.yourdomain.com`, at `http://localhost:8080`.
   - For a quick test without a domain, run `cloudflared tunnel --url http://localhost:8080`. It prints a `https://….trycloudflare.com` address, but that address changes every time it restarts.

### C. Any VPS with Docker
```
docker build -t delegatedesk .
docker run -d -p 8080:8080 -v dd:/data \
  -e BASE_URL=https://delegatedesk.pages.dev -e PROXY_SECRET=... -e TRUST_PROXY=2 -e APP_SECRET=... delegatedesk
```
Put HTTPS in front of it (Caddy, nginx, or Cloudflare Tunnel).

## Step 2: upload the website to Cloudflare Pages
1. In the Cloudflare dashboard, go to **Workers & Pages → Create → Pages → Upload assets**.
2. Name the project (e.g. `delegatedesk`) and drop in **`DelegateDesk-cloudflare-pages.zip`**. Don't unzip it; the files are already at the top level. Deploy.
3. Open the project's **Settings → Variables and Secrets** and add two variables to **Production**:
   - `BACKEND_URL`: the server address from Step 1, e.g. `https://delegatedesk-api.onrender.com`. No trailing slash.
   - `PROXY_SECRET` (type: Secret): the same value as on the server.
4. Variables only take effect on a new deployment. Go to **Deployments → Create deployment** and drop the same zip again.

## Step 3: connect the two
1. Make sure the server's `BASE_URL` is your Pages address (e.g. `https://delegatedesk.pages.dev`, or your custom domain), then restart the server. Emails, payment return links and secure cookies all use it.
2. Open `https://<your-site>/api/health`. It should show `{"ok":true,…}`.
3. Open `https://<your-site>/list` and create your first conference.

If the server address is opened directly, the server refuses with "Use the site address, not the server address". That is the `PROXY_SECRET` working.

---

## Good to know
- **A custom domain**: Pages → Custom domains. Afterwards, change the server's `BASE_URL` to the custom domain and restart.
- **Payment gateway webhooks** (Razorpay, Cashfree, WhatsApp) use `https://<your-site>/api/webhooks/...`. They reach the server through Pages.
- **Workers request limits on the free plan (100,000 requests a day)**: everything under `/api` counts. A live committee session refreshes about every 1.5 seconds for each open screen, so a big conference day (say 150 delegates following sessions for 6 hours) can pass 100,000. For conference days, switch Workers to the paid plan ($5 a month, 10 million requests).
- **Demo data**: a new server starts empty. Organisers sign up at `/list`. To load the demo conference and demo accounts instead, run `npm run seed -- --demo` once on the server (Render: Shell tab).
- **Backups**: Settings → Backups inside the app. On Render the database lives on the attached disk.
- **Updating**: rebuild with `npm run build`, then zip `web/dist` together with `cloudflare/_worker.js` and `cloudflare/_headers`, and upload it as a new Pages deployment. Redeploy the server from GitHub (Render) or restart `start.bat`.
