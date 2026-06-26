@echo off
echo ========================================
echo   WorldCup Predictor
echo ========================================
echo.
set NODE_ENV=production
set PORT=8888
echo Starting server on port 8888...
echo Visit: http://localhost:8888
echo.
node server/index.js
pause