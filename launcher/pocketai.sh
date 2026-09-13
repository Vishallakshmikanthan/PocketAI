#!/usr/bin/env bash

set -e

POCKETAI_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

CONFIG="$POCKETAI_ROOT/config/pocketai.conf"

if [[ ! -f "$CONFIG" ]]; then
    echo "ERROR: configuration file not found:"
    echo "$CONFIG"
    exit 1
fi

source "$CONFIG"

RUNTIME="$POCKETAI_ROOT/runtime"
MODEL="$POCKETAI_ROOT/models/$MODEL_FILE"

SERVER="$RUNTIME/bin/llama-server"
LIB_DIR="$RUNTIME/lib"

echo "================================"
echo "            PocketAI"
echo "================================"
echo
echo "Root:    $POCKETAI_ROOT"
echo "Model:   $MODEL"
echo "Address: $HOST:$PORT"
echo "Context: $CONTEXT"
echo

if [[ ! -x "$SERVER" ]]; then
    echo "ERROR: llama-server not found or not executable:"
    echo "$SERVER"
    exit 1
fi

if [[ ! -f "$MODEL" ]]; then
    echo "ERROR: model not found:"
    echo "$MODEL"
    exit 1
fi

if ! [[ "$PORT" =~ ^[0-9]+$ ]] || (( PORT < 1 || PORT > 65535 )); then
    echo "ERROR: invalid port: $PORT"
    exit 1
fi

if ss -ltn 2>/dev/null | grep -q ":$PORT "; then
    echo "ERROR: port $PORT is already in use."
    echo "Another service may already be running on this port."
    exit 1
fi

export LD_LIBRARY_PATH="$LIB_DIR${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"

echo "Starting local AI server..."
echo

exec "$SERVER" \
    -m "$MODEL" \
    --host "$HOST" \
    --port "$PORT" \
    -c "$CONTEXT"
