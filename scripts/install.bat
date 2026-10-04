@echo off
cd /d "%~dp0.."
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not found.
    echo Please install Node.js from https://nodejs.org and re-run this file.
    pause
    exit /b 1
)
echo [OK] Node.js found:
node --version
echo.
echo [->] Installing dependencies... (first time may take 1-2 min)
call npm install
if %errorlevel% neq 0 (
    echo [ERROR] npm install failed. Check your internet connection.
    pause
    exit /b 1
)
echo.
echo [->] Downloading the Electron runtime... (Electron 44 and later do not fetch it during npm install)
call node node_modules\electron\install.js
if %errorlevel% neq 0 (
    echo [ERROR] The Electron runtime could not be downloaded. Check your internet connection.
    pause
    exit /b 1
)
echo.
echo [OK] Done. Run scripts\start.bat to launch the app.
pause
