# Döschl Whispert Local

**Local speech-to-text for Obsidian using whisper.cpp.**

No cloud. No API keys. No costs. Everything runs on your machine.

![License](https://img.shields.io/github/license/latein-lernen/obsidian-whisper-local)

**Author:** Döschl ([latein-lernen.com](https://latein-lernen.com))

---

## What it does

Click the Voice button above your AI chat input, speak, click again. Your speech appears directly in the chat — and gets sent to the AI automatically if you want.

- **100% local** — audio never leaves your computer
- **100% free** — no API keys, no subscriptions, no usage limits, no costs. Ever.
- **Works with any AI chat plugin** — Claudian, Copilot, YOLO, or any future chat plugin
- **GPU accelerated** — uses your graphics card (Vulkan/CUDA) for fast transcription
- **99 languages** — powered by OpenAI's Whisper model (open source)
- **Auto-Send** — optionally sends the message immediately after transcription

## Why this plugin?

There are other voice plugins for Obsidian. None of them do what this one does.

| Plugin | Local? | Free? | Voice into AI Chat? |
|--------|--------|-------|---------------------|
| **Döschl Whispert Local** | ✅ whisper.cpp on your GPU | ✅ No API key, no costs | ✅ Voice button above every chat input |
| [Whisper](https://github.com/nikdanilov/whisper-obsidian-plugin) (nikdanilov) | ❌ Cloud (OpenAI/Groq/Azure) | ❌ API key required, pay per minute | ❌ Notes only |
| [Local Whisper](https://github.com/cdiak/local-whisper) (cdiak) | ✅ Local | ✅ Free | ❌ Notes only |
| [Local Whisper Obsidian](https://github.com/serg-markovich/local-whisper-obsidian) | ✅ Local | ✅ Free | ❌ External pipeline, no chat |
| [Whisper Local](https://github.com/AnkushMalaker/whisper-obsidian-plugin-local) (AnkushMalaker) | ✅ Local | ✅ Free | ❌ Notes only |

**The difference:** Every other plugin transcribes into notes. Döschl Whispert Local is the only one that puts a Voice button directly above your AI chat input — so you can talk to your AI assistant instead of typing. And it works with **any** chat plugin, not just one.

## How it works

1. Records audio via your microphone (MediaRecorder API)
2. Converts to WAV using the Web Audio API (no ffmpeg needed)
3. Transcribes locally using [whisper.cpp](https://github.com/ggerganov/whisper.cpp)
4. Inserts the text into your active AI chat input (or sends it automatically)

## Requirements

- **Obsidian** v1.4.5 or later (desktop only — not available on mobile)
- **whisper.cpp** (the `whisper-cli` binary)
- **A whisper model** (downloaded through the plugin or manually)
- **Linux** (primary platform), macOS support planned

## Installation

### Step 1: Install the plugin

**Via BRAT (recommended for beta):**
1. Install the [BRAT](https://github.com/TfTHacker/obsidian42-brat) plugin
2. In BRAT settings, click "Add Beta Plugin"
3. Enter: `latein-lernen/obsidian-whisper-local`

**Manual:**
1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/latein-lernen/obsidian-whisper-local/releases/latest)
2. Create the folder `.obsidian/plugins/whisper-local/` in your vault
3. Copy the three files into that folder
4. In Obsidian: Settings → Community Plugins → Enable "Whisper Local"

### Step 2: Install whisper.cpp

You need the `whisper-cli` binary on your system.

| Distribution | Command |
|-------------|---------|
| **NixOS** | `nix profile install nixpkgs#whisper-cpp-vulkan` |
| **Ubuntu / Debian** | `sudo apt install whisper.cpp` or [build from source](https://github.com/ggerganov/whisper.cpp#build) |
| **Arch Linux** | `yay -S whisper.cpp-vulkan` (AUR) |
| **Fedora** | [Build from source](https://github.com/ggerganov/whisper.cpp#build) |
| **macOS** | `brew install whisper-cpp` |

<details>
<summary>Building from source (all platforms)</summary>

```bash
git clone https://github.com/ggerganov/whisper.cpp.git
cd whisper.cpp
cmake -B build -DGGML_VULKAN=ON   # or -DGGML_CUDA=ON for NVIDIA CUDA
cmake --build build --config Release
# Binary is at: build/bin/whisper-cli
```

</details>

### Step 3: Download a model

Open the plugin settings in Obsidian and use the built-in model downloader. Or download manually:

```bash
mkdir -p ~/.local/share/whisper-cpp/models
cd ~/.local/share/whisper-cpp/models
wget https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin
```

**Model recommendations:**

| Model | Size | Speed | Quality | Best for |
|-------|------|-------|---------|----------|
| Tiny | 75 MB | Fastest | Basic | Quick tests |
| Base | 142 MB | Fast | Good | Simple dictation |
| **Small** | **465 MB** | **Fast** | **Very good** | **Recommended** |
| Medium | 1.5 GB | Moderate | Excellent | When quality matters |
| Large v3 | 3.1 GB | Slow | Best | Maximum accuracy |

### Step 4: Configure

1. Open Obsidian Settings → Whisper Local
2. The plugin auto-detects `whisper-cli` and models on your system
3. If not found: click "Detect" or enter paths manually
4. Click "Test: Record 3s" to verify everything works

## Usage

**Voice bar:** A "Voice" button appears automatically above every AI chat input field (Claudian, Copilot, YOLO, or any other chat plugin).

**Ribbon icon:** Alternatively, click the waveform icon in the left sidebar.

**Command palette:** `Ctrl+P` → "Start/stop voice recording"

**Hotkey:** Assign a custom hotkey in Obsidian Settings → Hotkeys → search "Whisper Local"

### Recording flow

1. Click the Voice button above your chat input → button turns **red**, shows "Recording..."
2. Speak
3. Click again → button shows "Transcribing..."
4. Text appears in the chat input (and gets sent automatically if Auto-Send is enabled)

## FAQ

**Q: Does this work offline?**
A: Yes, completely. No internet connection needed after installation.

**Q: Does this work on mobile?**
A: No. The plugin requires Node.js APIs (child_process) which are only available on desktop.

**Q: Which GPU backends are supported?**
A: Vulkan (recommended for Linux, works with NVIDIA and AMD) and CUDA (NVIDIA only). CPU fallback always works.

**Q: How fast is the transcription?**
A: With the `small` model on a modern GPU, a 10-second recording transcribes in under 1 second. On CPU, expect 2-5 seconds.

**Q: The plugin doesn't find my whisper-cli. What now?**
A: Enter the full path manually in settings. Find it with: `which whisper-cli` in your terminal.

## Privacy

This plugin processes all audio locally on your device. No data is sent to any server, ever. The only network requests are optional model downloads from HuggingFace (you can also download models manually).

## License

[MIT](LICENSE) — free to use, modify, and distribute.

## Credits

- [whisper.cpp](https://github.com/ggerganov/whisper.cpp) by Georgi Gerganov — the C++ port of OpenAI's Whisper
- [OpenAI Whisper](https://github.com/openai/whisper) — the original speech recognition model
- [Obsidian](https://obsidian.md) — the note-taking app
