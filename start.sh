#!/bin/bash
# Auto Spec Test 啟動腳本
# 用法: ./start.sh [dev|prod]

MODE=${1:-prod}

echo "🚀 Auto Spec Test 啟動中 (mode: $MODE)"

# 確保在專案根目錄
cd "$(dirname "$0")"

if [ "$MODE" = "dev" ]; then
  echo "📦 啟動開發模式 (tsx watch + next dev)..."
  pnpm --filter server dev &
  pnpm --filter web dev &
  wait
elif [ "$MODE" = "prod" ]; then
  echo "🔨 編譯 server..."
  pnpm --filter server build

  echo "🖥️  啟動 backend (http://localhost:4001)..."
  cd packages/server && node dist/index.js &
  BACKEND_PID=$!
  cd ../..

  echo "🌐 啟動 frontend (http://localhost:3000)..."
  pnpm --filter web dev &
  FRONTEND_PID=$!

  echo ""
  echo "✅ 系統已啟動"
  echo "   Frontend: http://localhost:3000"
  echo "   Backend:  http://localhost:4001"
  echo ""
  echo "按 Ctrl+C 停止所有服務"

  trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0" SIGINT SIGTERM
  wait
else
  echo "❌ 未知模式: $MODE"
  echo "用法: ./start.sh [dev|prod]"
  exit 1
fi
