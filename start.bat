@echo off
echo ================================================
echo   Crazy Boyz Cricket Statistics Dashboard
echo ================================================
echo.

REM Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js is not installed!
    echo.
    echo Please install Node.js from: https://nodejs.org/
    echo.
    echo Alternative: Open demo.html in your browser to see the UI
    pause
    exit /b 1
)

REM Check if dependencies are installed
if not exist "node_modules\" (
    echo Installing dependencies...
    echo.
    call npm install
    if %ERRORLEVEL% NEQ 0 (
        echo [ERROR] Failed to install dependencies
        pause
        exit /b 1
    )
    echo.
)

echo Starting the dashboard server...
echo.
echo Dashboard will be available at:
echo   http://localhost:3000/index.html
echo.
echo For mobile access (same WiFi):
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4 Address"') do (
    set IP=%%a
    set IP=!IP:~1!
    echo   http://!IP!:3000/index.html
)
echo.
echo Press Ctrl+C to stop the server
echo ================================================
echo.

node proxy-server.js
