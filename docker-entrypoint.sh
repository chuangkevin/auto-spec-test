#!/bin/bash
set -e

echo "Starting auto-spec-test..."

# Start Fastify backend (port 3001)
node packages/server/dist/index.js &
BACKEND_PID=$!

# Start Next.js frontend (port 3000)
# standalone server.js is placed at packages/web/server.js by Next.js
HOSTNAME=0.0.0.0 PORT=3000 node packages/web/server.js &
FRONTEND_PID=$!

echo "Backend PID: $BACKEND_PID (port 3001)"
echo "Frontend PID: $FRONTEND_PID (port 3000)"

# Wait for either process to exit, then stop the other
wait -n
EXIT_CODE=$?
echo "A process exited with code $EXIT_CODE, shutting down..."
kill $BACKEND_PID $FRONTEND_PID 2>/dev/null || true
exit $EXIT_CODE
