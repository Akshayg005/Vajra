@echo off
title VAJRA - AI Thunderstorm ^& Lightning Nowcasting
color 0B
cd /d "%~dp0"

echo.
echo  ========================================================
echo    V A J R A  -  Thunderstorm ^& Lightning Nowcasting
echo  ========================================================
echo.

:: ── Check Node.js ──────────────────────────────────────────
where node >nul 2>&1
if %errorlevel% neq 0 (
    color 0C
    echo  [ERROR] Node.js is not installed or not in PATH.
    echo.
    echo  Please install Node.js 20+ from https://nodejs.org
    echo.
    pause
    exit /b 1
)

:: Show Node version
for /f "tokens=*" %%v in ('node -v') do set NODE_VER=%%v
echo  [OK] Node.js %NODE_VER% detected
echo.

:: ── Install dependencies if needed ─────────────────────────
if not exist "node_modules" (
    echo  [SETUP] First run detected - installing dependencies...
    echo  This may take a minute or two. Please wait...
    echo.
    call npm install
    if %errorlevel% neq 0 (
        color 0C
        echo.
        echo  [ERROR] npm install failed. Check errors above.
        pause
        exit /b 1
    )
    echo.
    echo  [OK] Dependencies installed successfully!
    echo.
) else (
    echo  [OK] Dependencies already installed
    echo.
)

:: ── Optional: Setup Python API venv ────────────────────────
if not exist "apps\api\.venv" (
    where python >nul 2>&1
    if %errorlevel% equ 0 (
        echo  [SETUP] Setting up Python API (optional)...
        python -m venv apps\api\.venv
        apps\api\.venv\Scripts\python.exe -m pip install --upgrade pip -q
        apps\api\.venv\Scripts\python.exe -m pip install -r apps\api\requirements-dev.txt -q
        echo  [OK] Python API ready on http://localhost:8000
        echo.
    ) else (
        echo  [SKIP] Python not found - skipping API setup.
        echo         The web app works fully offline without it.
        echo.
    )
)

:: ── Start API server in background (if venv exists) ────────
if exist "apps\api\.venv\Scripts\python.exe" (
    echo  [START] Launching API server on http://localhost:8000 ...
    start "VAJRA API" /min apps\api\.venv\Scripts\python.exe -m uvicorn app.main:app --port 8000 --app-dir apps\api
)

:: ── Open browser after a short delay ───────────────────────
echo  [START] Launching web app on http://localhost:5173
echo.
echo  --------------------------------------------------------
echo   Opening browser in 5 seconds...
echo   Press Ctrl+C in this window to stop the server.
echo  --------------------------------------------------------
echo.

:: Start a background process to open the browser after delay
start /b cmd /c "timeout /t 5 /nobreak >nul && start http://localhost:5173/#/welcome"

:: ── Start Vite dev server (foreground) ─────────────────────
call npm run dev

:: If the server stops, pause so user can see any errors
echo.
echo  Server stopped.
pause
