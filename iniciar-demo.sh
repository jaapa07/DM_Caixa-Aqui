#!/usr/bin/env sh
# DM Caixa Aqui — modo demonstração (macOS/Linux). Requer Node.js 20+.
cd "$(dirname "$0")" || exit 1
command -v node >/dev/null 2>&1 || { echo "Instale o Node.js LTS: https://nodejs.org"; exit 1; }
[ -d node_modules ] || npm install || exit 1
exec npm run demo
