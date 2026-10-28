@echo off
title Deploy DelegateDesk to Cloudflare
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js is not installed. Get the LTS version from https://nodejs.org, install it, then run this again. & pause & exit /b 1)
echo A browser window opens: sign in to Cloudflare and press Allow.
call npx --yes wrangler@4 login || (pause & exit /b 1)
call npx --yes wrangler@4 deploy || (pause & exit /b 1)
echo.
echo Deployed. Now in the Cloudflare dashboard open Workers ^& Pages ^> delegatedesk ^> Settings ^> Variables and Secrets
echo and add BACKEND_URL (your DelegateDesk server address) and PROXY_SECRET. Then open https://your-site/setup
pause
