#!/bin/bash
cd /home/z/my-project
while true; do
    echo "[$(date)] Starting dev server..."
    NODE_OPTIONS="--max-old-space-size=3072" bun run dev 2>&1 &
    SERVER_PID=$!
    echo "[$(date)] Server PID: $SERVER_PID"
    wait $SERVER_PID
    EXIT_CODE=$?
    echo "[$(date)] Server exited with code: $EXIT_CODE"
    if [ $EXIT_CODE -eq 0 ]; then
        break
    fi
    echo "[$(date)] Restarting in 3s..."
    sleep 3
done
