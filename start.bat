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
echo [  OK]  node %NODE_VER%  ^|  curl installed

REM ── Python version resolution (requires 3.10 – 3.12) ─────
set "PYTHON_CMD="

REM 1) Check default python
where python >nul 2>&1
if !ERRORLEVEL! equ 0 (
    for /f "tokens=2" %%v in ('python --version 2^>^&1') do set "_PV=%%v"
    for /f "tokens=1,2 delims=." %%a in ("!_PV!") do (
        if %%a equ 3 if %%b geq 10 if %%b leq 12 set "PYTHON_CMD=python"
    )
)

REM 2) Try the Windows Python Launcher (py -3.12, py -3.11, py -3.10)
if "!PYTHON_CMD!"=="" (
    where py >nul 2>&1
    if !ERRORLEVEL! equ 0 (
        for %%m in (12 11 10) do (
            if "!PYTHON_CMD!"=="" (
                py -3.%%m --version >nul 2>&1
                if !ERRORLEVEL! equ 0 set "PYTHON_CMD=py -3.%%m"
            )
        )
    )
)

REM 3) Auto-install via winget if nothing found
if "!PYTHON_CMD!"=="" (
    echo [WARN]  No Python 3.10 – 3.12 found. Attempting to install Python 3.12...
    where winget >nul 2>&1
    if !ERRORLEVEL! equ 0 (
        echo [INFO]  Installing Python 3.12 via winget...
        winget install -e --id Python.Python.3.12 --accept-source-agreements --accept-package-agreements
        if !ERRORLEVEL! equ 0 (
            REM Refresh PATH so the new install is visible
            set "PATH=%LOCALAPPDATA%\Programs\Python\Python312;%LOCALAPPDATA%\Programs\Python\Python312\Scripts;!PATH!"
            where py >nul 2>&1
            if !ERRORLEVEL! equ 0 (
                set "PYTHON_CMD=py -3.12"
            ) else (
                where python >nul 2>&1
                if !ERRORLEVEL! equ 0 set "PYTHON_CMD=python"
            )
        )
    )
)

if "!PYTHON_CMD!"=="" (
    echo [FAIL]  Could not find or install Python 3.10 – 3.12.
    echo         Please install Python 3.10, 3.11, or 3.12 from https://python.org
    echo         Make sure to check "Add Python to PATH" during installation.
    pause
    exit /b 1
)

for /f "tokens=2" %%v in ('!PYTHON_CMD! --version 2^>^&1') do set PY_VER=%%v
echo [  OK]  Python %PY_VER% (!PYTHON_CMD!) — supported range (3.10 – 3.12).
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
REM If existing venv uses wrong Python version, recreate it
if exist "%ROOT%.venv\Scripts\python.exe" (
    set "_VENV_OK=0"
    for /f "tokens=2" %%v in ('"%ROOT%.venv\Scripts\python.exe" --version 2^>^&1') do (
        for /f "tokens=1,2 delims=." %%a in ("%%v") do (
            if %%a equ 3 if %%b geq 10 if %%b leq 12 set "_VENV_OK=1"
        )
    )
    if "!_VENV_OK!"=="0" (
        echo [WARN]  Existing venv uses incompatible Python. Recreating...
        rmdir /s /q "%ROOT%.venv"
    )
)
if not exist "%ROOT%.venv" (
    echo [INFO]  Creating Python virtual environment with !PYTHON_CMD!...
    !PYTHON_CMD! -m venv "%ROOT%.venv"
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
