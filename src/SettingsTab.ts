/**
 * Plugin settings tab with status display, auto-detection,
 * model download, and a test function.
 */

import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type WhisperLocalPlugin from "./main";
import { BinaryDetector } from "./BinaryDetector";
import { ModelDownloader, DownloadProgress } from "./ModelDownloader";
import { LANGUAGES, MODELS } from "./constants";

export class WhisperLocalSettingsTab extends PluginSettingTab {
	plugin: WhisperLocalPlugin;

	constructor(app: App, plugin: WhisperLocalPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// ── Author / About ──────────────────────────────
		const aboutEl = containerEl.createDiv({ cls: "whisper-local-about" });
		aboutEl.createEl("strong", { text: "Döschl Whispert Local" });
		aboutEl.createEl("br");
		const authorLine = aboutEl.createSpan({ text: "Author: Döschl — " });
		authorLine.createEl("a", {
			text: "latein-lernen.com",
			href: "https://latein-lernen.com",
		});

		// ── Status Section ──────────────────────────────
		containerEl.createEl("h2", { text: "System Status" });
		this.renderStatus(containerEl);

		// ── Paths Section ───────────────────────────────
		containerEl.createEl("h2", { text: "Paths" });
		this.renderPathSettings(containerEl);

		// ── Transcription Section ───────────────────────
		containerEl.createEl("h2", { text: "Transcription" });
		this.renderTranscriptionSettings(containerEl);

		// ── Chat Section ────────────────────────────────
		containerEl.createEl("h2", { text: "Chat" });
		new Setting(containerEl)
			.setName("Auto-Send")
			.setDesc(
				"Automatically send the message after transcription. " +
				"If enabled, your voice input is immediately sent to the AI — no extra Enter needed."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.autoSend)
					.onChange(async (value) => {
						this.plugin.settings.autoSend = value;
						await this.plugin.saveSettings();
					})
			);

		// ── GPU Section ─────────────────────────────────
		containerEl.createEl("h2", { text: "GPU" });
		this.renderGpuSettings(containerEl);

		// ── Models Section ──────────────────────────────
		containerEl.createEl("h2", { text: "Models" });
		this.renderModelSection(containerEl);

		// ── Test Section ────────────────────────────────
		containerEl.createEl("h2", { text: "Test" });
		this.renderTestSection(containerEl);
	}

	/**
	 * Show detection status for whisper-cli, model, and GPU.
	 */
	private renderStatus(containerEl: HTMLElement): void {
		const statusEl = containerEl.createDiv({
			cls: "whisper-local-status",
		});

		const whisperOk = this.plugin.settings.whisperPath !== "";
		const modelOk = this.plugin.settings.modelPath !== "";

		this.statusLine(
			statusEl,
			"whisper-cli",
			whisperOk,
			whisperOk
				? this.plugin.settings.whisperPath
				: "Not configured"
		);
		this.statusLine(
			statusEl,
			"Model",
			modelOk,
			modelOk
				? this.plugin.settings.modelPath.split("/").pop() || ""
				: "Not configured"
		);

		// GPU info (async, update when available)
		const gpuLine = this.statusLine(
			statusEl,
			"GPU",
			false,
			"Detecting..."
		);
		if (whisperOk) {
			BinaryDetector.getGpuInfo(
				this.plugin.settings.whisperPath
			).then((info) => {
				gpuLine.setText(`GPU: ${info}`);
				gpuLine.toggleClass(
					"whisper-local-status-ok",
					info !== "CPU only"
				);
				gpuLine.toggleClass(
					"whisper-local-status-warn",
					info === "CPU only"
				);
			});
		} else {
			gpuLine.setText("GPU: Unknown (set whisper-cli path first)");
		}
	}

	/**
	 * Create a single status line element.
	 */
	private statusLine(
		parent: HTMLElement,
		label: string,
		ok: boolean,
		detail: string
	): HTMLElement {
		const line = parent.createDiv({
			cls: `whisper-local-status-line ${ok ? "whisper-local-status-ok" : "whisper-local-status-err"}`,
		});
		line.setText(
			`${ok ? "\u2705" : "\u274c"} ${label}: ${detail}`
		);
		return line;
	}

	/**
	 * Path settings with auto-detect buttons.
	 */
	private renderPathSettings(containerEl: HTMLElement): void {
		// whisper-cli path
		new Setting(containerEl)
			.setName("whisper-cli path")
			.setDesc("Absolute path to the whisper-cli binary.")
			.addText((text) => {
				text.setPlaceholder("/usr/local/bin/whisper-cli")
					.setValue(this.plugin.settings.whisperPath)
					.onChange(async (value) => {
						this.plugin.settings.whisperPath = value.trim();
						await this.plugin.saveSettings();
					});
				text.inputEl.style.width = "100%";
			})
			.addButton((btn) => {
				btn.setButtonText("Detect").onClick(async () => {
					const path = BinaryDetector.findWhisper();
					if (path) {
						this.plugin.settings.whisperPath = path;
						await this.plugin.saveSettings();
						new Notice(`Found whisper-cli: ${path}`);
						this.display(); // refresh
					} else {
						new Notice(
							"whisper-cli not found. Please install whisper.cpp and enter the path manually."
						);
					}
				});
			});

		// Model path
		new Setting(containerEl)
			.setName("Model path")
			.setDesc("Absolute path to a GGML model file (.bin).")
			.addText((text) => {
				text.setPlaceholder(
					"~/.local/share/whisper-cpp/models/ggml-small.bin"
				)
					.setValue(this.plugin.settings.modelPath)
					.onChange(async (value) => {
						this.plugin.settings.modelPath = value.trim();
						await this.plugin.saveSettings();
					});
				text.inputEl.style.width = "100%";
			})
			.addButton((btn) => {
				btn.setButtonText("Detect").onClick(async () => {
					const models = BinaryDetector.findModels();
					if (models.length > 0) {
						this.plugin.settings.modelPath = models[0].path;
						await this.plugin.saveSettings();
						new Notice(
							`Found model: ${models[0].name} (${models[0].sizeMB} MB)`
						);
						this.display(); // refresh
					} else {
						new Notice(
							"No models found. Download one below or enter the path manually."
						);
					}
				});
			});
	}

	/**
	 * Language and thread settings.
	 */
	private renderTranscriptionSettings(containerEl: HTMLElement): void {
		new Setting(containerEl)
			.setName("Language")
			.setDesc(
				"Language for speech recognition. Use 'Auto-detect' if unsure."
			)
			.addDropdown((dropdown) => {
				for (const lang of LANGUAGES) {
					dropdown.addOption(lang.value, lang.label);
				}
				dropdown
					.setValue(this.plugin.settings.language)
					.onChange(async (value) => {
						this.plugin.settings.language = value;
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("CPU threads")
			.setDesc(
				"Number of CPU threads for whisper. 0 = automatic (recommended)."
			)
			.addSlider((slider) => {
				slider
					.setLimits(0, 16, 1)
					.setValue(this.plugin.settings.threads)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.threads = value;
						await this.plugin.saveSettings();
					});
			});
	}

	/**
	 * GPU toggle.
	 */
	private renderGpuSettings(containerEl: HTMLElement): void {
		new Setting(containerEl)
			.setName("Disable GPU")
			.setDesc(
				"Force CPU-only transcription. Only enable this if you experience GPU issues."
			)
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.noGpu)
					.onChange(async (value) => {
						this.plugin.settings.noGpu = value;
						await this.plugin.saveSettings();
					});
			});
	}

	/**
	 * Model download section with progress.
	 */
	private renderModelSection(containerEl: HTMLElement): void {
		const desc = containerEl.createEl("p", {
			text: "Download whisper models directly from HuggingFace. Models are stored locally and reused across sessions.",
			cls: "setting-item-description",
		});

		for (const model of MODELS) {
			const setting = new Setting(containerEl)
				.setName(
					`${model.label}${model.recommended ? " \u2b50" : ""}`
				)
				.setDesc(`${model.description} (~${model.sizeMB} MB)`);

			// Check if already downloaded
			const existingModels = BinaryDetector.findModels();
			const isDownloaded = existingModels.some(
				(m) => m.name === model.id
			);

			if (isDownloaded) {
				setting.addButton((btn) => {
					btn.setButtonText("\u2705 Downloaded")
						.setDisabled(true);
				});
				// Add "Use this" button if it's not the current model
				const downloadedModel = existingModels.find(
					(m) => m.name === model.id
				);
				if (
					downloadedModel &&
					downloadedModel.path !==
						this.plugin.settings.modelPath
				) {
					setting.addButton((btn) => {
						btn.setButtonText("Use this").onClick(
							async () => {
								this.plugin.settings.modelPath =
									downloadedModel.path;
								await this.plugin.saveSettings();
								new Notice(
									`Now using: ${model.label}`
								);
								this.display();
							}
						);
					});
				}
			} else {
				setting.addButton((btn) => {
					btn.setButtonText("Download").onClick(async () => {
						btn.setButtonText("Downloading...");
						btn.setDisabled(true);

						try {
							const targetDir =
								ModelDownloader.getDefaultModelDir();
							const path =
								await ModelDownloader.download(
									model.id,
									targetDir,
									(progress: DownloadProgress) => {
										if (!isNaN(progress.percent)) {
											btn.setButtonText(
												`${Math.round(progress.percent)}%`
											);
										}
									}
								);

							// Auto-set as active model if none configured
							if (
								!this.plugin.settings.modelPath
							) {
								this.plugin.settings.modelPath =
									path;
								await this.plugin.saveSettings();
							}

							new Notice(
								`Model ${model.label} downloaded successfully.`
							);
							this.display(); // refresh
						} catch (err) {
							const msg =
								err instanceof Error
									? err.message
									: String(err);
							new Notice(
								`Download failed: ${msg}`
							);
							btn.setButtonText("Download");
							btn.setDisabled(false);
						}
					});
				});
			}
		}
	}

	/**
	 * Test section: record 3 seconds and transcribe.
	 */
	private renderTestSection(containerEl: HTMLElement): void {
		const resultEl = containerEl.createDiv({
			cls: "whisper-local-test-result",
		});

		new Setting(containerEl)
			.setName("Test transcription")
			.setDesc(
				"Records 3 seconds of audio, transcribes it, and shows the result."
			)
			.addButton((btn) => {
				btn.setButtonText("\ud83c\udf99\ufe0f Test: Record 3s")
					.setCta()
					.onClick(async () => {
						if (
							!this.plugin.settings.whisperPath ||
							!this.plugin.settings.modelPath
						) {
							new Notice(
								"Configure whisper-cli path and model first."
							);
							return;
						}

						btn.setButtonText("Recording...");
						btn.setDisabled(true);
						resultEl.setText("");

						try {
							// Record 3 seconds
							await this.plugin.recorder.start();
							await new Promise((r) =>
								setTimeout(r, 3000)
							);
							const blob =
								await this.plugin.recorder.stop();

							if (!blob) {
								resultEl.setText(
									"No audio captured."
								);
								return;
							}

							btn.setButtonText("Transcribing...");

							const result =
								await this.plugin.transcriber.transcribe(
									blob
								);

							if (result.success) {
								resultEl.setText(
									`Result: "${result.text}" (${result.durationMs}ms)`
								);
								resultEl.addClass(
									"whisper-local-status-ok"
								);
							} else {
								resultEl.setText(
									`Error: ${result.error}`
								);
								resultEl.addClass(
									"whisper-local-status-err"
								);
							}
						} catch (err) {
							const msg =
								err instanceof Error
									? err.message
									: String(err);
							resultEl.setText(`Error: ${msg}`);
							resultEl.addClass(
								"whisper-local-status-err"
							);
						} finally {
							btn.setButtonText(
								"\ud83c\udf99\ufe0f Test: Record 3s"
							);
							btn.setDisabled(false);
						}
					});
			});
	}
}
