#!/usr/bin/env bash

set -e

POCKETAI_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

UI_DIR="$POCKETAI_ROOT/ui"

HOST="127.0.0.1"
PORT="3000"

if [[ ! -d "$UI_DIR" ]]; then
    echo "ERROR: UI directory not found:"
    echo "$UI_DIR"
    exit 1
fi

if ! [[ "$PORT" =~ ^[0-9]+$ ]] || (( PORT < 1 || PORT > 65535 )); then
    echo "ERROR: invalid UI port: $PORT"
    exit 1
fi

if ss -ltn 2>/dev/null | grep -q ":$PORT "; then
    echo "ERROR: UI port $PORT is already in use."
    exit 1
fi

echo "PocketAI UI"
echo "Address: http://$HOST:$PORT"
echo

exec python -m http.server "$PORT" \
    --directory "$UI_DIR" \
    --bind "$HOST"
