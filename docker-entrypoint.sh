#!/bin/bash
set -e

echo "Starting auto-spec-test..."

# Start nginx (port 3000 — reverse proxy, foreground 不 fork)
nginx -g 'daemon off;' &
NGINX_PID=$!
echo "Nginx PID: $NGINX_PID (port 3000)"

# Start Fastify backend (port 3001)
node packages/server/dist/index.js &
BACKEND_PID=$!
echo "Backend PID: $BACKEND_PID (port 3001)"

# Start Next.js frontend (port 3002 — behind nginx)
HOSTNAME=0.0.0.0 PORT=3002 node packages/web/server.js &
FRONTEND_PID=$!
echo "Frontend PID: $FRONTEND_PID (port 3002)"

# Wait for either process to exit, then stop the other
wait -n
EXIT_CODE=$?
echo "A process exited with code $EXIT_CODE, shutting down..."
kill $NGINX_PID $BACKEND_PID $FRONTEND_PID 2>/dev/null || true
exit $EXIT_CODE
