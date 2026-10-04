@echo off
cd /d "%~dp0"

echo [->] Building Marubako installer exe...
if not exist "node_modules\electron\package.json" (
    echo [->] Installing dependencies first...
    call npm install
    if %errorlevel% neq 0 (
        echo [ERROR] npm install failed.
        pause
        exit /b 1
    )
)

call npm run dist
if %errorlevel% neq 0 (
    echo [ERROR] Build failed.
    pause
    exit /b 1
)

echo.
echo [OK] Build completed. Output folder: release\
explorer release
pause
