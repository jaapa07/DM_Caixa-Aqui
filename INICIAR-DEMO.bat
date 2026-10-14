@echo off
chcp 65001 >nul
title DM Caixa Aqui - Modo demonstracao
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Node.js nao encontrado. Instale a versao LTS em https://nodejs.org e execute este arquivo novamente.
  echo.
  pause
  exit /b 1
)
if not exist node_modules (
  echo Instalando dependencias - so na primeira vez, pode levar alguns minutos...
  call npm install
  if errorlevel 1 (
    echo Falha ao instalar as dependencias.
    pause
    exit /b 1
  )
)
call npm run demo
pause
