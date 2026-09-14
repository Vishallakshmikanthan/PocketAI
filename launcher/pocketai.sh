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

UI_DIR="$POCKETAI_ROOT/ui"
UI_HOST="127.0.0.1"
UI_PORT="3000"

SERVER_PID=""
UI_PID=""

cleanup() {
    echo
    echo "Shutting down PocketAI..."

    if [[ -n "$UI_PID" ]] && kill -0 "$UI_PID" 2>/dev/null; then
        kill "$UI_PID" 2>/dev/null || true
    fi

    if [[ -n "$SERVER_PID" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
        kill "$SERVER_PID" 2>/dev/null || true
    fi

    wait 2>/dev/null || true

    echo "PocketAI stopped."
}

trap cleanup EXIT INT TERM

wait_for_ai() {
    local timeout=60
    local elapsed=0

    echo "Waiting for AI server..."

    while (( elapsed < timeout )); do
        if ! kill -0 "$SERVER_PID" 2>/dev/null; then
            echo "ERROR: AI server stopped during startup."
            return 1
        fi

        if curl -fsS "http://$HOST:$PORT/health" >/dev/null 2>&1; then
            echo "AI server: READY"
            return 0
        fi

        sleep 1
        ((elapsed+=1))
    done

    echo "ERROR: AI server startup timed out."
    return 1
}

wait_for_ui() {
    local timeout=10
    local elapsed=0

    echo "Waiting for UI server..."

    while (( elapsed < timeout )); do
        if ! kill -0 "$UI_PID" 2>/dev/null; then
            echo "ERROR: UI server stopped during startup."
            return 1
        fi

        if curl -fsS "http://$UI_HOST:$UI_PORT/" >/dev/null 2>&1; then
            echo "UI server: READY"
            return 0
        fi

        sleep 1
        ((elapsed+=1))
    done

    echo "ERROR: UI server startup timed out."
    return 1
}

echo "================================"
echo "            PocketAI"
echo "================================"
echo
echo "Root:    $POCKETAI_ROOT"
echo "Model:   $MODEL_NAME"
echo "File:    $MODEL_FILE"
echo "AI API:  http://$HOST:$PORT"
echo "UI:      http://$UI_HOST:$UI_PORT"
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

if [[ ! -d "$UI_DIR" ]]; then
    echo "ERROR: UI directory not found:"
    echo "$UI_DIR"
    exit 1
fi

if ! [[ "$PORT" =~ ^[0-9]+$ ]] || (( PORT < 1 || PORT > 65535 )); then
    echo "ERROR: invalid AI port: $PORT"
    exit 1
fi

if ! [[ "$UI_PORT" =~ ^[0-9]+$ ]] || (( UI_PORT < 1 || UI_PORT > 65535 )); then
    echo "ERROR: invalid UI port: $UI_PORT"
    exit 1
fi

if (( PORT == UI_PORT )); then
    echo "ERROR: AI and UI ports must be different."
    exit 1
fi

if ! (
    cd "$POCKETAI_ROOT" &&
    sha256sum -c "$CHECKSUM" --status
); then
    echo "ERROR: model integrity check failed."
    echo "The model may be corrupted or modified."
    exit 1
fi

echo "Model integrity: OK"

if ss -ltn 2>/dev/null | grep -q ":$PORT "; then
    echo "ERROR: AI port $PORT is already in use."
    exit 1
fi

if ss -ltn 2>/dev/null | grep -q ":$UI_PORT "; then
    echo "ERROR: UI port $UI_PORT is already in use."
    exit 1
fi

export LD_LIBRARY_PATH="$LIB_DIR${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"

echo
echo "Starting AI server..."

"$SERVER" \
    -m "$MODEL" \
    --host "$HOST" \
    --port "$PORT" \
    -c "$CONTEXT" &

SERVER_PID=$!

echo "AI server PID: $SERVER_PID"

if ! wait_for_ai; then
    exit 1
fi

echo
echo "Starting PocketAI UI..."

python -m http.server "$UI_PORT" \
    --directory "$UI_DIR" \
    --bind "$UI_HOST" &

UI_PID=$!

echo "UI server PID: $UI_PID"

if ! wait_for_ui; then
    exit 1
fi

echo
echo "================================"
echo "       PocketAI READY"
echo "================================"
echo
echo "AI API: http://$HOST:$PORT"
echo "UI:     http://$UI_HOST:$UI_PORT"
echo
echo "Press Ctrl+C to stop PocketAI."
echo

while true; do
    if ! kill -0 "$SERVER_PID" 2>/dev/null; then
        echo "ERROR: AI server stopped unexpectedly."
        exit 1
    fi

    if ! kill -0 "$UI_PID" 2>/dev/null; then
        echo "ERROR: UI server stopped unexpectedly."
        exit 1
    fi

    sleep 1
done
