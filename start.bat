@echo off
title El Espejo — Start All Services
echo ========================================
echo   El Espejo — Starting all services
echo ========================================
echo.

:: Start Vision Service (port 3001)
echo [1/3] Starting Vision Service...
start "Vision Service" cmd /c "cd /d "%~dp0" && .venv\Scripts\python.exe vision-service\src\vision_server.py"

:: Wait a moment for vision service to initialize
timeout /t 3 /nobreak >nul

:: Start Orchestrator (port 3000)
echo [2/3] Starting Orchestrator...
start "Orchestrator" cmd /c "cd /d "%~dp0orchestrator" && node src\index.js"

:: Wait a moment for orchestrator
timeout /t 2 /nobreak >nul

:: Start Frontend (port 5173)
echo [3/3] Starting Frontend...
start "Frontend" cmd /c "cd /d "%~dp0frontend" && npx vite --host --open"

echo.
echo ========================================
echo   All services starting.
echo   Close this window to stop nothing.
echo   Close each service window individually.
echo ========================================
echo.
echo   Vision Service : http://localhost:3001
echo   Orchestrator   : http://localhost:3000
echo   Frontend       : http://localhost:5173
echo.
pause
