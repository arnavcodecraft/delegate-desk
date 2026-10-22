@echo off
title DelegateDesk
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js is not installed. Get the LTS version from https://nodejs.org, install it, then run this again. & pause & exit /b 1)
if not exist node_modules (
  echo Installing - first run only, takes a minute or two...
  call npm install || (pause & exit /b 1)
)
if not exist web\dist\index.html call npm run build
if not exist data\delegatedesk.db (
  echo Loading demo data...
  call npm run seed -- --demo
)
echo.
echo DelegateDesk is starting at http://localhost:8080/login
echo Sign in as desk@example.org  password ChangeMe!2026
echo Keep this window open. Close it to stop the app.
echo.
start "" cmd /c "timeout /t 6 >nul & start http://localhost:8080/login"
set ALLOW_SANDBOX=1
call npm start
pause
