@echo off
title DelegateDesk LIVE
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js is not installed. Get the LTS version from https://nodejs.org, install it, then run this again. & pause & exit /b 1)
node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)" || (echo Your Node.js is too old. DelegateDesk needs version 22.13 or newer: install the LTS version from https://nodejs.org, then run this again. & node -v & pause & exit /b 1)
if not exist node_modules (
  echo Installing - first run only, takes a few minutes...
  call npm install || (pause & exit /b 1)
)
if not exist web\dist\index.html call npm run build
node scripts\live.mjs
pause
