# PocketAI

**PocketAI is a portable, offline-first local AI environment designed to run from removable storage.**

It combines a local `llama.cpp` inference runtime, a Qwen3 4B GGUF model, a lightweight browser interface, integrity verification, and a USB-friendly project layout.

> **Core idea:** plug the storage into a compatible Linux machine, launch PocketAI, and run inference locally without sending prompts to a cloud AI service.

## Features

- **Local inference** powered by `llama.cpp`
- **Qwen3 4B Q4_K_M** GGUF model
- **Browser UI** served locally on `127.0.0.1:3000`
- **Local API** exposed by `llama-server` on `127.0.0.1:8080`
- **Persistent conversation history** stored in browser `localStorage`
- **Multiple chats** with new-chat, switching, deletion, and automatic titles
- **Generation controls** for temperature and maximum output tokens
- **Custom system prompt** per conversation
- **SHA-256 model verification** before startup
- **JSON conversation export**
- **USB-oriented layout** with runtime, configuration, models, and data separated
- **No cloud inference** in the default architecture

## Architecture

```text
                 Removable Storage
                         │
                     PocketAI
                         │
        ┌────────────────┼────────────────┐
        │                │                │
     launcher/        runtime/         models/
        │                │                │
  startup + checks   llama.cpp        Qwen3 GGUF
        │                │
        └───────────────┼───────────────┐
                        │               │
                  llama-server       config/
                        │            model metadata
                 127.0.0.1:8080
                        │
                        ▼
                 Local Web UI
                 127.0.0.1:3000
                        │
                        ▼
                    Browser
```

## Project structure

```text
PocketAI/
├── launcher/
│   └── pocketai.sh
├── runtime/
│   ├── bin/
│   │   ├── llama-server
│   │   └── llama-cli
│   └── lib/
│       └── llama.cpp shared libraries
├── models/
│   └── Qwen3-4B-Q4_K_M.gguf
├── config/
│   ├── pocketai.conf
│   └── models/
│       ├── qwen3-4b-q4_k_m.conf
│       └── qwen3-4b-q4_k_m.sha256
├── data/
├── ui/
│   ├── index.html
│   ├── style.css
│   ├── history.css
│   └── app.js
└── README.md
```

## Requirements

PocketAI currently targets a **Linux x86_64 host** with:

- Python 3
- `curl`
- `ss` from the `iproute2` package
- a glibc-compatible userspace
- enough RAM for the selected model
- a compatible CPU for the bundled runtime

### Important portability note

The current `llama.cpp` runtime was built with CPU-native optimization (`GGML_NATIVE=ON`). That means the binary is optimized for the machine used to build it and **should not yet be described as universally portable across every x86_64 PC**.

A future portability release should provide a more broadly compatible CPU build and/or runtime selection.

## Quick start

### 1. Get PocketAI

```bash
git clone https://github.com/Vishallakshmikanthan/PocketAI.git
cd PocketAI
```

### 2. Add the model

The GGUF model is intentionally **not stored in Git** because it is several gigabytes.

Place the model at:

```text
models/Qwen3-4B-Q4_K_M.gguf
```

The expected SHA-256 checksum is recorded in:

```text
config/models/qwen3-4b-q4_k_m.sha256
```

Verify it:

```bash
cd PocketAI
sha256sum -c config/models/qwen3-4b-q4_k_m.sha256
```

You should see:

```text
models/Qwen3-4B-Q4_K_M.gguf: OK
```

### 3. Launch

```bash
chmod +x launcher/pocketai.sh
./launcher/pocketai.sh
```

The launcher starts both the local AI server and the web UI, performs startup validation, checks the model checksum, and cleans up child processes when the launcher exits.

Open:

```text
http://127.0.0.1:3000
```

## Using the UI

PocketAI provides:

- **New chat** to start an independent conversation
- **History** to switch between saved conversations
- **Delete** to remove an individual conversation
- **Clear session** to clear the active conversation
- **Export log** to save the active conversation as JSON
- **Temperature** control for generation behavior
- **Max tokens** control for response length
- **System prompt** customization
- server health status
- token and message counters

Conversation history is kept in the browser's local storage. It is not uploaded by the PocketAI UI.

## USB deployment

PocketAI is designed around a removable-storage layout.

A typical deployment looks like:

```text
USB/
└── PocketAI/
    ├── launcher/
    ├── runtime/
    ├── models/
    ├── config/
    ├── data/
    └── ui/
```

Copy the project directory to the removable drive, ensure the model is present, and launch it from the mounted filesystem.

### Filesystem note

The current runtime has been tested with a Linux-mounted removable drive. Filesystems such as VFAT do not preserve normal Unix executable permission bits, so the mount configuration may need to expose files as executable on Linux.

## Building the runtime

PocketAI's development workflow uses `llama.cpp` as the inference backend.

Example development build:

```bash
git clone https://github.com/ggml-org/llama.cpp.git
cd llama.cpp

cmake -B build -DGGML_NATIVE=ON -DGGML_CUDA=OFF
cmake --build build --config Release -j$(nproc)
```

The resulting server, CLI, and required shared libraries can then be staged under PocketAI's `runtime/` directory.

For a genuinely portable distribution, build configuration should be revisited to avoid CPU-specific assumptions.

## Model

PocketAI currently uses:

```text
Model:        Qwen3 4B
Format:       GGUF
Quantization: Q4_K_M
```

Model metadata and integrity information are kept under:

```text
config/models/
```

The large `.gguf` model file is ignored by Git.

## Privacy model

PocketAI is designed around local execution:

```text
Prompt
  │
  ▼
Browser
  │
  ▼
127.0.0.1:8080
  │
  ▼
llama.cpp
  │
  ▼
Local model
```

There is no cloud inference service in the default architecture.

The browser UI stores conversation history locally using `localStorage`. Exported conversations are generated as local JSON files.

> Local-first does not automatically mean secure against a compromised host. If the host machine is untrusted, its operating system and user account can still access local files and processes.

## Troubleshooting

### UI does not open

Check whether the launcher is running and whether port `3000` is available:

```bash
ss -ltnp | grep ':3000'
```

### AI server is offline

Check port `8080`:

```bash
ss -ltnp | grep ':8080'
```

The UI expects:

```text
http://127.0.0.1:8080
```

### Model verification fails

Run:

```bash
sha256sum -c config/models/qwen3-4b-q4_k_m.sha256
```

If it fails, do not use the model until the expected file has been restored.

### Runtime library errors

Check that the bundled libraries exist:

```bash
ls -lh runtime/lib/
```

The launcher sets `LD_LIBRARY_PATH` to the PocketAI runtime library directory.

## Development principles

PocketAI is being developed around a few principles:

1. **Local first** — inference should stay on the host.
2. **Portable by design** — runtime, configuration, model, UI, and launcher remain separated.
3. **Explicit validation** — startup should fail clearly when prerequisites are missing.
4. **Reproducible model integrity** — model files are verified with SHA-256.
5. **Small, meaningful commits** — project history should reflect engineering milestones rather than one giant snapshot.

## Roadmap

- broader CPU portability
- improved runtime dependency bundling
- stronger cross-platform launcher support
- optional streaming responses
- richer Markdown rendering
- encrypted local conversation storage
- hardware-aware runtime selection
- packaging for additional operating systems

## Status

PocketAI currently has a working local inference stack, launcher, browser UI, model integrity verification, persistent chat history, and configurable generation controls.

The project is still under active development, with portability and packaging being the next major engineering areas.
