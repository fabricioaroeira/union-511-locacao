@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ========================================
echo   PUSH PARA GITHUB - Union 511
echo ========================================
echo.

REM Remove .git antigo se existir (limpa qualquer estado quebrado)
if exist ".git" (
    echo Limpando .git antigo...
    rmdir /s /q .git
)

REM Criar .gitignore
(
echo .DS_Store
echo node_modules/
echo *.log
echo _deploy_zip.zip
echo _TUDO_ALL-SQLS-RUN-NO-SUPABASE.sql
echo sql/
echo imgs/
echo js/lojas-coords.js
echo vercel.json
echo PUSH_GITHUB.bat
) > .gitignore

REM Inicializar git fresh
echo Inicializando repositorio git...
git init -b main
if errorlevel 1 (
    echo ERRO: git nao foi encontrado. Instale Git for Windows em https://git-scm.com/download/win
    pause
    exit /b 1
)

git config user.email "fabricio@apexengenharia.com.br"
git config user.name "Fabricio Aroeira"

REM Adicionar remote
git remote add origin https://github.com/fabricioaroeira/union-511-locacao.git

REM Stage + commit
echo.
echo Adicionando arquivos...
git add .

echo.
echo Criando commit...
git commit -m "Initial commit: Union 511 - Gestao de Locacao"

REM Push
echo.
echo Fazendo push para GitHub...
echo.
echo IMPORTANTE: Se aparecer janela "Sign in to GitHub",
echo clique em "Sign in with your browser" e autorize.
echo.
git push -u origin main

echo.
echo ========================================
if errorlevel 1 (
    echo   FALHOU - veja o erro acima
) else (
    echo   SUCESSO! Codigo no GitHub!
)
echo ========================================
echo.
pause
