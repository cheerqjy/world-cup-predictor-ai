@echo off

echo ========================================
echo   WorldCup Predictor - Dev Mode
echo ========================================
echo.
echo Starting backend server (port 3001)...
echo Starting frontend dev server (Vite)...
echo.

start "Backend-3001" cmd /k "cd /d %~dp0 && node server/index.js"

timeout /t 2 /nobreak >nul

start "Frontend-Vite" cmd /k "cd /d %~dp0 && npm run dev"

echo.
echo Done! Two services started in new windows.
echo    Backend:  http://localhost:3001
echo    Frontend: http://localhost:5173
echo.
echo Close this window - services will keep running.
echo.
pause
