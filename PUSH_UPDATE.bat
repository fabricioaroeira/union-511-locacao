@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ========================================
echo   PUSH UPDATE - Union 511
echo ========================================
echo.

git add .
git commit -m "Fix: paths relativos para GitHub Pages"
git push origin main

echo.
echo ========================================
if errorlevel 1 (
    echo   FALHOU - veja o erro acima
) else (
    echo   SUCESSO! Update no ar em 1 minuto
)
echo ========================================
echo.
pause
