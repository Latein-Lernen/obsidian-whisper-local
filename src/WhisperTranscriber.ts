/**
 * Orchestrates the transcription pipeline:
 * Audio Blob → WAV (via AudioConverter) → whisper-cli → text.
 *
 * Manages temp files and cleanup, runs whisper-cli via child_process.
 */

import { writeFileSync, unlinkSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { execFile } from "child_process";

import { convertBlobToWav } from "./AudioConverter";
import { WhisperLocalSettings } from "./settings";

/** Result of a transcription attempt */
export interface TranscriptionResult {
	/** True if transcription succeeded */
	success: boolean;
	/** The transcribed text (empty on failure) */
	text: string;
	/** Error message on failure */
	error?: string;
	/** Time taken in milliseconds */
	durationMs: number;
}

export class WhisperTranscriber {
	constructor(private settings: WhisperLocalSettings) {}

	/**
	 * Transcribe an audio Blob to text.
	 *
	 * Pipeline:
	 * 1. Convert Blob to 16kHz mono WAV via Web Audio API
	 * 2. Write WAV to temp file
	 * 3. Run whisper-cli
	 * 4. Parse and return transcript
	 * 5. Clean up temp files
	 */
	async transcribe(audioBlob: Blob): Promise<TranscriptionResult> {
		const startTime = Date.now();
		const wavPath = this.tempPath(".wav");

		try {
			// Step 1: Convert to WAV
			const wavBuffer = await convertBlobToWav(audioBlob);

			// Step 2: Write to temp file
			writeFileSync(wavPath, Buffer.from(wavBuffer));

			// Step 3: Run whisper-cli
			const text = await this.runWhisper(wavPath);

			return {
				success: true,
				text,
				durationMs: Date.now() - startTime,
			};
		} catch (err) {
			const message =
				err instanceof Error ? err.message : String(err);
			return {
				success: false,
				text: "",
				error: message,
				durationMs: Date.now() - startTime,
			};
		} finally {
			// Step 5: Cleanup
			this.cleanup(wavPath);
		}
	}

	/**
	 * Run whisper-cli on a file and return the transcript text.
	 */
	private runWhisper(filePath: string): Promise<string> {
		return new Promise((resolve, reject) => {
			const args = this.buildArgs(filePath);

			execFile(
				this.settings.whisperPath,
				args,
				{
					timeout: 60000, // 60s timeout
					maxBuffer: 2 * 1024 * 1024, // 2 MB
				},
				(err, stdout, stderr) => {
					if (err) {
						console.error(
							"[Whisper Local] whisper-cli error:",
							err.message
						);
						if (stderr) {
							console.error(
								"[Whisper Local] stderr:",
								stderr
							);
						}
						reject(
							new Error(
								`whisper-cli failed: ${err.message}`
							)
						);
						return;
					}

					// Clean up the output
					let text = stdout.trim();

					// Remove common whisper artifacts
					text = text.replace(/\[BLANK_AUDIO\]/g, "");
					text = text.replace(/^\s*\n/gm, ""); // empty lines
					text = text.trim();

					resolve(text);
				}
			);
		});
	}

	/**
	 * Build the command-line arguments for whisper-cli.
	 */
	private buildArgs(filePath: string): string[] {
		const args: string[] = [
			"-m",
			this.settings.modelPath,
			"-l",
			this.settings.language,
			"--no-timestamps",
			"--no-prints",
			"-f",
			filePath,
		];

		// Thread count (0 = whisper default/auto)
		if (this.settings.threads > 0) {
			args.push("-t", String(this.settings.threads));
		}

		// GPU control
		if (this.settings.noGpu) {
			args.push("--no-gpu");
		}

		return args;
	}

	/**
	 * Generate a unique temp file path.
	 */
	private tempPath(ext: string): string {
		const id =
			Date.now().toString(36) +
			Math.random().toString(36).slice(2, 8);
		return join(tmpdir(), `whisper-local-${id}${ext}`);
	}

	/**
	 * Delete temp files, ignoring errors.
	 */
	private cleanup(...files: string[]): void {
		for (const f of files) {
			try {
				unlinkSync(f);
			} catch {
				// File already gone or never created
			}
		}
	}
}
