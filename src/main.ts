/**
 * Döschl Whispert Local — Obsidian Plugin
 *
 * Local speech-to-text using whisper.cpp.
 * No cloud, no API keys, no costs.
 *
 * Adds a voice input button above any AI chat input field in Obsidian.
 * Works with any chat plugin — Claudian, Copilot, YOLO, or future ones.
 * No plugin-specific code. Pure DOM detection.
 *
 * Author: Döschl (latein-lernen.com)
 * License: MIT
 */

import { Notice, Plugin, addIcon } from "obsidian";

import { WhisperLocalSettings, DEFAULT_SETTINGS } from "./settings";
import { WhisperLocalSettingsTab } from "./SettingsTab";
import { VoiceRecorder } from "./VoiceRecorder";
import { WhisperTranscriber } from "./WhisperTranscriber";
import { BinaryDetector } from "./BinaryDetector";
import { CSS_PREFIX } from "./constants";

// ── Icons ────────────────────────────────────────────

/** Audio waveform icon for ribbon */
const ICON_ID = "whisper-local-voice";
const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="4" y1="10" x2="4" y2="14"/><line x1="7.5" y1="7" x2="7.5" y2="17"/><line x1="11" y1="4" x2="11" y2="20"/><line x1="14.5" y1="8" x2="14.5" y2="16"/><line x1="18" y1="6" x2="18" y2="18"/><line x1="21.5" y1="10" x2="21.5" y2="14"/></svg>`;

/** Smaller version for the voice bar */
const ICON_INLINE = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="4" y1="10" x2="4" y2="14"/><line x1="7.5" y1="7" x2="7.5" y2="17"/><line x1="11" y1="4" x2="11" y2="20"/><line x1="14.5" y1="8" x2="14.5" y2="16"/><line x1="18" y1="6" x2="18" y2="18"/><line x1="21.5" y1="10" x2="21.5" y2="14"/></svg>';

// ── Plugin state ─────────────────────────────────────

type PluginState = "idle" | "recording" | "transcribing";

export default class WhisperLocalPlugin extends Plugin {
	settings: WhisperLocalSettings = DEFAULT_SETTINGS;
	recorder: VoiceRecorder = new VoiceRecorder();
	transcriber!: WhisperTranscriber;

	private state: PluginState = "idle";
	private ribbonIcon: HTMLElement | null = null;
	private voiceBars: HTMLElement[] = [];
	private barObserver: MutationObserver | null = null;
	private brandingObserver: MutationObserver | null = null;

	// ── Lifecycle ────────────────────────────────────

	async onload(): Promise<void> {
		await this.loadSettings();
		this.transcriber = new WhisperTranscriber(this.settings);

		addIcon(ICON_ID, ICON_SVG);

		this.ribbonIcon = this.addRibbonIcon(
			ICON_ID,
			"Voice input (Döschl Whispert Local)",
			() => this.toggleRecording()
		);

		this.addCommand({
			id: "toggle-recording",
			name: "Start/stop voice recording",
			callback: () => this.toggleRecording(),
		});

		this.addSettingTab(new WhisperLocalSettingsTab(this.app, this));

		if (!this.settings.setupComplete) {
			this.runAutoDetection();
		}

		this.initVoiceBarInjection();
		this.initPluginListBranding();

		console.log("[Whisper Local] Plugin loaded.");
	}

	async onunload(): Promise<void> {
		if (this.recorder.isRecording) {
			this.recorder.cancel();
		}
		this.setState("idle");

		this.voiceBars.forEach((bar) => bar.remove());
		this.voiceBars = [];

		if (this.barObserver) {
			this.barObserver.disconnect();
			this.barObserver = null;
		}
		if (this.brandingObserver) {
			this.brandingObserver.disconnect();
			this.brandingObserver = null;
		}

		console.log("[Whisper Local] Plugin unloaded.");
	}

	// ── Recording ────────────────────────────────────

	async toggleRecording(): Promise<void> {
		if (this.state === "transcribing") {
			new Notice("Transcription in progress, please wait...");
			return;
		}

		if (this.state === "recording") {
			await this.stopAndTranscribe();
		} else {
			await this.startRecording();
		}
	}

	private async startRecording(): Promise<void> {
		if (!this.settings.whisperPath) {
			new Notice("Döschl Whispert Local: whisper-cli not configured. Open Settings.");
			return;
		}
		if (!this.settings.modelPath) {
			new Notice("Döschl Whispert Local: No model configured. Open Settings.");
			return;
		}

		if (!this.findChatInput()) {
			new Notice("Döschl Whispert Local: No AI chat window open.");
			return;
		}

		try {
			await this.recorder.start();
			this.setState("recording");
			new Notice("Recording... Click again to stop.");
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			if (msg.includes("Permission") || msg.includes("NotAllowed")) {
				new Notice("Döschl Whispert Local: Microphone access denied.");
			} else {
				new Notice(`Döschl Whispert Local: ${msg}`);
			}
		}
	}

	private async stopAndTranscribe(): Promise<void> {
		this.setState("transcribing");

		try {
			const blob = await this.recorder.stop();
			if (!blob) {
				new Notice("No audio captured.");
				this.setState("idle");
				return;
			}

			const result = await this.transcriber.transcribe(blob);

			if (result.success && result.text) {
				this.insertIntoChatInput(result.text);
				console.log(
					`[Whisper Local] Transcribed in ${result.durationMs}ms: "${result.text}"`
				);
			} else if (result.success && !result.text) {
				new Notice("No speech detected.");
			} else {
				new Notice(`Transcription failed: ${result.error}`);
			}
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			new Notice(`Döschl Whispert Local: ${msg}`);
		} finally {
			this.setState("idle");
		}
	}

	// ── Chat input detection (generic, DOM-based) ────

	/**
	 * Check if an element is part of Obsidian's core editor
	 * (CodeMirror, metadata, search, etc.)
	 */
	private isCoreInput(el: Element): boolean {
		return !!(
			el.closest(".cm-editor") ||
			el.closest(".markdown-source-view") ||
			el.classList.contains("cm-content") ||
			el.closest(".metadata-container") ||
			el.closest(".metadata-properties")
		);
	}

	/**
	 * Find a chat input inside a specific container.
	 * Returns the first textarea or contenteditable that
	 * isn't part of Obsidian's core editor.
	 */
	private findInputInContainer(container: HTMLElement): HTMLElement | null {
		const textarea = container.querySelector("textarea");
		if (textarea && !this.isCoreInput(textarea)) {
			return textarea;
		}

		const editable = container.querySelector(
			'[contenteditable="true"][role="textbox"]'
		) as HTMLElement | null;
		if (editable && !this.isCoreInput(editable)) {
			return editable;
		}

		return null;
	}

	/**
	 * Find the best chat input to insert text into.
	 * Priority: active leaf first, then any leaf.
	 */
	private findChatInput(): HTMLElement | null {
		// Active leaf first
		const activeLeaf = document.querySelector(
			".workspace-leaf.mod-active"
		);
		if (activeLeaf) {
			const input = this.findInputInContainer(
				activeLeaf as HTMLElement
			);
			if (input) return input;
		}

		// Fallback: any leaf
		for (const leaf of Array.from(
			document.querySelectorAll(".workspace-leaf")
		)) {
			const input = this.findInputInContainer(
				leaf as HTMLElement
			);
			if (input) return input;
		}

		return null;
	}

	// ── Text insertion ───────────────────────────────

	private insertIntoChatInput(text: string): void {
		const input = this.findChatInput();

		if (!input) {
			new Notice("Döschl Whispert Local: Chat window was closed during recording.");
			return;
		}

		// Textarea (e.g. Claudian)
		if (input instanceof HTMLTextAreaElement) {
			const start = input.selectionStart ?? input.value.length;
			const end = input.selectionEnd ?? start;
			const val = input.value;
			const prefix =
				start > 0 && val[start - 1] !== " " && val[start - 1] !== "\n"
					? " "
					: "";

			input.value =
				val.substring(0, start) + prefix + text + val.substring(end);
			const newPos = start + prefix.length + text.length;
			input.setSelectionRange(newPos, newPos);
			input.dispatchEvent(new Event("input", { bubbles: true }));
			input.focus();

			if (this.settings.autoSend) {
				this.simulateEnter(input);
			}
			return;
		}

		// ContentEditable / Lexical (e.g. Copilot, YOLO)
		if (input.isContentEditable) {
			input.focus();

			const selection = window.getSelection();
			if (selection) {
				selection.selectAllChildren(input);
				selection.collapseToEnd();
			}

			document.execCommand("insertText", false, text);

			if (this.settings.autoSend) {
				setTimeout(() => this.simulateEnter(input), 100);
			}
			return;
		}

		new Notice("Döschl Whispert Local: Could not insert text.");
	}

	private simulateEnter(el: HTMLElement): void {
		el.dispatchEvent(
			new KeyboardEvent("keydown", {
				key: "Enter",
				code: "Enter",
				keyCode: 13,
				which: 13,
				bubbles: true,
				cancelable: true,
			})
		);
	}

	// ── Voice bar injection ──────────────────────────

	/**
	 * Inject a "Voice" button bar directly above every
	 * chat input field found in the DOM.
	 *
	 * Generic approach: scans for textarea/contenteditable,
	 * skips core Obsidian editors, places bar above the rest.
	 * Works with any current or future chat plugin.
	 *
	 * Re-injection is handled by:
	 * - layout-change / active-leaf-change events
	 * - MutationObserver (for plugins that re-render, like YOLO)
	 */
	private initVoiceBarInjection(): void {
		const inject = () => {
			const inputs = [
				...Array.from(document.querySelectorAll("textarea")),
				...Array.from(
					document.querySelectorAll(
						'[contenteditable="true"][role="textbox"]'
					)
				),
			];

			for (const input of inputs) {
				if (!input.closest(".workspace-leaf")) continue;
				if (this.isCoreInput(input)) continue;

				const wrapper = input.parentElement;
				if (!wrapper?.parentElement) continue;

				// Already injected?
				if (
					wrapper.parentElement.querySelector(
						`.${CSS_PREFIX}-voice-bar`
					)
				)
					continue;

				// Create voice bar
				const bar = document.createElement("div");
				bar.className = `${CSS_PREFIX}-voice-bar`;

				const btn = document.createElement("button");
				btn.className = `${CSS_PREFIX}-voice-bar-btn`;
				btn.innerHTML = ICON_INLINE;
				btn.title = "Voice input (Döschl Whispert Local)";
				btn.addEventListener("click", (e) => {
					e.stopPropagation();
					this.toggleRecording();
				});

				const label = document.createElement("span");
				label.className = `${CSS_PREFIX}-voice-bar-label`;
				label.textContent = "Voice";

				bar.appendChild(btn);
				bar.appendChild(label);

				wrapper.parentElement.insertBefore(bar, wrapper);
				this.voiceBars.push(bar);
			}
		};

		// Initial injection after layout is ready
		this.app.workspace.onLayoutReady(() => {
			setTimeout(inject, 500);
		});

		// Re-inject on workspace changes
		this.registerEvent(
			this.app.workspace.on("layout-change", () =>
				setTimeout(inject, 300)
			)
		);
		this.registerEvent(
			this.app.workspace.on("active-leaf-change", () =>
				setTimeout(inject, 300)
			)
		);

		// Re-inject when a bar gets removed by plugin re-renders
		let debounce: ReturnType<typeof setTimeout> | null = null;
		this.barObserver = new MutationObserver(() => {
			const before = this.voiceBars.length;
			this.voiceBars = this.voiceBars.filter((bar) =>
				document.contains(bar)
			);
			if (this.voiceBars.length < before) {
				if (debounce) clearTimeout(debounce);
				debounce = setTimeout(inject, 200);
			}
		});
		this.barObserver.observe(document.body, {
			childList: true,
			subtree: true,
		});
	}

	private updateVoiceBars(): void {
		for (const bar of this.voiceBars) {
			const btn = bar.querySelector(`.${CSS_PREFIX}-voice-bar-btn`);
			const label = bar.querySelector(`.${CSS_PREFIX}-voice-bar-label`);
			if (!btn || !label) continue;

			btn.classList.remove(
				`${CSS_PREFIX}-recording`,
				`${CSS_PREFIX}-transcribing`
			);

			switch (this.state) {
				case "recording":
					btn.classList.add(`${CSS_PREFIX}-recording`);
					(label as HTMLElement).textContent = "Recording...";
					break;
				case "transcribing":
					btn.classList.add(`${CSS_PREFIX}-transcribing`);
					(label as HTMLElement).textContent = "Transcribing...";
					break;
				default:
					(label as HTMLElement).textContent = "Voice";
			}
		}
	}

	// ── Branding in plugin list ──────────────────────

	private initPluginListBranding(): void {
		const brand = () => {
			for (const nameEl of Array.from(
				document.querySelectorAll(".setting-item-name")
			)) {
				if (nameEl.textContent?.trim() !== "Döschl Whispert Local")
					continue;

				const descEl = nameEl.nextElementSibling as HTMLElement | null;
				if (!descEl) continue;

				const authorDiv = descEl.children[1] as HTMLElement | undefined;
				if (
					!authorDiv ||
					authorDiv.classList.contains(`${CSS_PREFIX}-author-branded`)
				)
					continue;

				authorDiv.classList.add(`${CSS_PREFIX}-author-branded`);
				authorDiv.innerHTML = "";

				const badge = authorDiv.createSpan({
					cls: `${CSS_PREFIX}-author-badge`,
				});
				badge.createSpan({ text: "By " });
				badge.createEl("strong", { text: "Döschl" });
				badge.createSpan({ text: " — " });
				badge.createEl("a", {
					text: "latein-lernen.com",
					href: "https://latein-lernen.com",
					cls: `${CSS_PREFIX}-author-link`,
				});
			}
		};

		brand();
		let brandDebounce: ReturnType<typeof setTimeout> | null = null;
		this.brandingObserver = new MutationObserver(() => {
			if (brandDebounce) clearTimeout(brandDebounce);
			brandDebounce = setTimeout(brand, 500);
		});
		this.brandingObserver.observe(document.body, {
			childList: true,
			subtree: true,
		});
	}

	// ── State management ─────────────────────────────

	private setState(state: PluginState): void {
		this.state = state;
		this.updateRibbonIcon();
		this.updateVoiceBars();
	}

	private updateRibbonIcon(): void {
		if (!this.ribbonIcon) return;

		this.ribbonIcon.classList.remove(
			`${CSS_PREFIX}-recording`,
			`${CSS_PREFIX}-transcribing`
		);

		switch (this.state) {
			case "recording":
				this.ribbonIcon.classList.add(`${CSS_PREFIX}-recording`);
				this.ribbonIcon.ariaLabel = "Stop recording";
				break;
			case "transcribing":
				this.ribbonIcon.classList.add(`${CSS_PREFIX}-transcribing`);
				this.ribbonIcon.ariaLabel = "Transcribing...";
				break;
			default:
				this.ribbonIcon.ariaLabel =
					"Voice input (Döschl Whispert Local)";
		}
	}

	// ── Auto-detection ───────────────────────────────

	private async runAutoDetection(): Promise<void> {
		let changed = false;

		if (!this.settings.whisperPath) {
			const path = BinaryDetector.findWhisper();
			if (path) {
				this.settings.whisperPath = path;
				changed = true;
			}
		}

		if (!this.settings.modelPath) {
			const models = BinaryDetector.findModels();
			if (models.length > 0) {
				this.settings.modelPath = models[0].path;
				changed = true;
			}
		}

		if (changed) {
			this.settings.setupComplete = true;
			await this.saveSettings();
			this.transcriber = new WhisperTranscriber(this.settings);
		}
	}

	// ── Settings persistence ─────────────────────────

	async loadSettings(): Promise<void> {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		// Update transcriber with new settings (path, model, language etc.)
		this.transcriber = new WhisperTranscriber(this.settings);
	}
}
