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

MODEL_CONFIG="$POCKETAI_ROOT/config/models/$MODEL_ID.conf"

if [[ ! -f "$MODEL_CONFIG" ]]; then
    echo "ERROR: model configuration not found:"
    echo "$MODEL_CONFIG"
    exit 1
fi

source "$MODEL_CONFIG"

RUNTIME="$POCKETAI_ROOT/runtime"
MODEL="$POCKETAI_ROOT/models/$MODEL_FILE"
CHECKSUM="$POCKETAI_ROOT/config/models/$MODEL_ID.sha256"

SERVER="$RUNTIME/bin/llama-server"
LIB_DIR="$RUNTIME/lib"

echo "================================"
echo "            PocketAI"
echo "================================"
echo
echo "Root:    $POCKETAI_ROOT"
echo "Model:   $MODEL_NAME"
echo "File:    $MODEL_FILE"
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

if [[ ! -f "$CHECKSUM" ]]; then
    echo "ERROR: model checksum file not found:"
    echo "$CHECKSUM"
    exit 1
fi

if ! [[ "$PORT" =~ ^[0-9]+$ ]] || (( PORT < 1 || PORT > 65535 )); then
    echo "ERROR: invalid port: $PORT"
    exit 1
fi

echo "Verifying model integrity..."

if ! (
    cd "$POCKETAI_ROOT" &&
    sha256sum -c "$CHECKSUM" --status
); then
    echo "ERROR: model integrity check failed."
    echo "The model may be corrupted or modified."
    exit 1
fi

echo "Model integrity: OK"
echo

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
