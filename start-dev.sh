#!/bin/bash
# Start both the landing page and the app in parallel

echo "Starting Astro Suite dev servers..."
echo "  Landing page: http://localhost:5173"
echo "  App:          http://localhost:3001 (proxied at /app)"
echo ""

# Start the app server
cd "$(dirname "$0")/Astro/floor-plan-3d" && npm run dev &
APP_PID=$!

# Start the landing page server
cd "$(dirname "$0")/scroll-landing" && npm run dev &
LANDING_PID=$!

# Cleanup on exit
trap "kill $APP_PID $LANDING_PID 2>/dev/null" EXIT

wait
