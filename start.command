#!/bin/zsh
set -eu
unsetopt BG_NICE 2>/dev/null || true

cd "$(dirname "$0")"

find_executable() {
    local command_name="$1"
    shift

    if command -v "$command_name" >/dev/null 2>&1; then
        command -v "$command_name"
        return 0
    fi

    local candidate
    for candidate in "$@"; do
        if [[ -x "$candidate" ]]; then
            print -r -- "$candidate"
            return 0
        fi
    done
    return 1
}

node_binary="$(find_executable node \
    /opt/homebrew/bin/node \
    /usr/local/bin/node \
    /usr/bin/node \
    "$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node" \
)" || {
    echo "Node.js could not be found. Install Node.js 18 or newer, then double-click this launcher again."
    read -r "?Press Return to close..."
    exit 1
}

yosys_binary="$(find_executable yosys \
    /opt/homebrew/bin/yosys \
    /usr/local/bin/yosys \
    /usr/bin/yosys \
)" || {
    echo "Yosys could not be found. Install it with Homebrew (brew install yosys), then try again."
    read -r "?Press Return to close..."
    exit 1
}

if [[ "${SKYR_APP_CHECK_ONLY:-0}" == "1" ]]; then
    echo "Node.js: $node_binary"
    echo "Yosys: $yosys_binary"
    exit 0
fi

app_port="${PORT:-4173}"
app_url="http://127.0.0.1:${app_port}/"
health_url="${app_url}api/health"

PORT="$app_port" YOSYS_BINARY="$yosys_binary" "$node_binary" server.mjs &
server_pid=$!
trap 'kill "$server_pid" 2>/dev/null || true' EXIT INT TERM

server_ready=0
for attempt in {1..40}; do
    health_payload="$(/usr/bin/curl --silent --fail --max-time 1 "$health_url" 2>/dev/null || true)"
    if [[ "$health_payload" == *'"modelVersion":"benchmark-paper-rho27-v1"'* ]]; then
        server_ready=1
        break
    fi
    sleep 0.2
done

if [[ "$server_ready" != "1" ]]; then
    echo "The local Skyrmion server did not start. Check the error above, then press Return."
    read -r
    exit 1
fi

echo "Skyrmion Verilog Mapper is ready at $app_url"
echo "Keep this window open while using the app. Closing it stops the local server."

if [[ "${SKYR_APP_NO_OPEN:-0}" != "1" ]]; then
    open -a Safari "$app_url"
fi

wait "$server_pid"
