@echo off
title DelegateDesk
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js is not installed. Get the LTS version from https://nodejs.org, install it, then run this again. & pause & exit /b 1)
node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)" || (echo Your Node.js is too old. DelegateDesk needs version 22.13 or newer: install the LTS version from https://nodejs.org, then run this again. & node -v & pause & exit /b 1)
if not exist node_modules (
  echo Installing - first run only, takes a minute or two...
  call npm install || (pause & exit /b 1)
)
if not exist web\dist\index.html call npm run build
echo.
echo DelegateDesk is starting at http://localhost:8080
echo List your first conference at http://localhost:8080/list
echo Keep this window open. Close it to stop the app.
echo.
start "" cmd /c "timeout /t 6 >nul & start http://localhost:8080/"
set ALLOW_SANDBOX=1
rem Local use: with no email service set up, sign-in codes are shown on screen.
set ALLOW_DEV_CODES=1
call npm start
echo.
echo The DelegateDesk server has stopped. Any error is shown above. Sign-in will not work until you run start.bat again.
pause
