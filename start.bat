@echo off
REM ──────────────────────────────────────────────────────────
REM  Sentinel Platform — Startup Script  (Windows)
REM ──────────────────────────────────────────────────────────
setlocal EnableDelayedExpansion
title Sentinel Platform

set "ROOT=%~dp0"
set "ML_DIR=%ROOT%ml_service"
set "BE_DIR=%ROOT%backend"
set "FE_DIR=%ROOT%frontend"

echo.
echo [INFO]  Sentinel Platform Startup
echo ──────────────────────────────────────────────────────────
echo.

REM ── 0. Pre-flight checks ──────────────────────────────────
echo [INFO]  Running pre-flight checks...

where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [FAIL]  Node.js is required but not found. Install from https://nodejs.org
    pause
    exit /b 1
)

where python >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [FAIL]  Python is required but not found. Install from https://python.org
    pause
    exit /b 1
)

where curl >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [FAIL]  curl is required but not found.
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('node -v') do set NODE_VER=%%v
for /f "tokens=2" %%v in ('python --version 2^>^&1') do set PY_VER=%%v
echo [  OK]  node %NODE_VER%  ^|  python %PY_VER%  ^|  curl installed
echo.

REM ── 1. Free ports ─────────────────────────────────────────
echo [INFO]  Freeing ports 8000, 4000, 5173...
for %%p in (8000 4000 5173) do (
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr :%%p ^| findstr LISTENING 2^>nul') do (
        taskkill /PID %%a /F >nul 2>&1
    )
)
timeout /t 1 /nobreak >nul
echo [  OK]  Ports cleared.
echo.

REM ── 2. Install dependencies ───────────────────────────────

REM Python venv + deps (single venv in project root)
if not exist "%ROOT%.venv" (
    echo [INFO]  Creating Python virtual environment...
    python -m venv "%ROOT%.venv"
)
if exist "%ROOT%requirements.txt" (
    echo [INFO]  Installing Python dependencies...
    "%ROOT%.venv\Scripts\pip.exe" install -q -r "%ROOT%requirements.txt"
    echo [  OK]  Python dependencies installed.
)

REM Node backend deps
if not exist "%BE_DIR%\node_modules" (
    echo [INFO]  Installing backend Node dependencies...
    pushd "%BE_DIR%"
    npm install --silent
    popd
    echo [  OK]  Backend dependencies installed.
)

REM Node frontend deps
if not exist "%FE_DIR%\node_modules" (
    echo [INFO]  Installing frontend Node dependencies...
    pushd "%FE_DIR%"
    npm install --silent
    popd
    echo [  OK]  Frontend dependencies installed.
)
echo.

REM ── 3. Start services ─────────────────────────────────────
echo [INFO]  Starting ML Service on :8000 ...
start "Sentinel-ML" /min cmd /c "cd /d "%ML_DIR%" && "%ROOT%.venv\Scripts\python.exe" -m uvicorn app:app --host 0.0.0.0 --port 8000"

echo [INFO]  Starting Backend on :4000 ...
start "Sentinel-Backend" /min cmd /c "cd /d "%BE_DIR%" && node src\index.js"

echo [INFO]  Starting Frontend on :5173 ...
start "Sentinel-Frontend" /min cmd /c "cd /d "%FE_DIR%" && node_modules\.bin\vite.cmd --port 5173 --host 0.0.0.0"

REM ── 4. Health checks ──────────────────────────────────────
echo.
echo [INFO]  Waiting for services to start...
timeout /t 6 /nobreak >nul

echo.
echo [INFO]  Running health checks...
echo.

curl -sf http://localhost:8000/health >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo [  OK]  ML Service   : http://localhost:8000
) else (
    echo [FAIL]  ML Service   : not responding on :8000
)

curl -sf http://localhost:4000/health >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo [  OK]  Backend      : http://localhost:4000
) else (
    echo [FAIL]  Backend      : not responding on :4000
)

curl -sf http://localhost:5173 >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo [  OK]  Frontend     : http://localhost:5173
) else (
    echo [FAIL]  Frontend     : not responding on :5173
)

echo.
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo   Sentinel is running!
echo   Dashboard : http://localhost:5173
echo   Backend   : http://localhost:4000
echo   ML Service: http://localhost:8000
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo.
echo   Close this window or press Ctrl+C to stop.
echo.
pause
