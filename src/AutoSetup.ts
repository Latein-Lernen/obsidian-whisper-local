/**
 * Zero-configuration automatic setup for Döschl Whispert Local.
 *
 * When whisper-cli is not found on the system, this module:
 * 1. Downloads a pre-built whisper-cli binary from our GitHub releases
 * 2. Downloads ggml-tiny.bin from HuggingFace (~75 MB)
 * 3. Updates plugin settings with the paths
 *
 * No terminal, no build tools, no user interaction required.
 * All progress is reported via callbacks so the UI can show Notice messages.
 */

import {
	existsSync,
	mkdirSync,
	chmodSync,
	createWriteStream,
	unlinkSync,
	renameSync,
} from "fs";
import { join } from "path";
import { homedir, tmpdir, platform, arch } from "os";
import { execFile } from "child_process";
import { IncomingMessage } from "http";

import { WhisperLocalSettings } from "./settings";
import { ModelDownloader, DownloadProgress } from "./ModelDownloader";

/** GitHub repo for pre-built binaries */
const GITHUB_RELEASE_BASE =
	"https://github.com/latein-lernen/obsidian-whisper-local/releases/latest/download";

/** Progress callback for UI updates */
export type SetupProgressCallback = (message: string) => void;

/**
 * Determine platform-specific paths and archive info.
 */
interface PlatformInfo {
	/** Directory to install whisper-cli into */
	baseDir: string;
	/** Full path to the binary */
	binaryPath: string;
	/** Full path to models directory */
	modelDir: string;
	/** Archive filename to download */
	archiveName: string;
	/** Whether archive is tar.gz (true) or zip (false) */
	isTarGz: boolean;
	/** Binary filename inside the archive */
	binaryFilename: string;
}

function getPlatformInfo(): PlatformInfo {
	const plat = platform();
	const ar = arch();
	const home = homedir();

	const isWindows = plat === "win32";
	const binaryFilename = isWindows ? "whisper-cli.exe" : "whisper-cli";

	// Determine base directory
	let baseDir: string;
	if (isWindows) {
		const appData = process.env.APPDATA || join(home, "AppData", "Roaming");
		baseDir = join(appData, "whisper-local");
	} else {
		baseDir = join(home, ".local", "share", "whisper-local");
	}

	const binDir = join(baseDir, "bin");
	const modelDir = join(baseDir, "models");

	// Determine archive name
	let archiveName: string;
	if (plat === "linux" && ar === "x64") {
		archiveName = "whisper-cli-linux-x64.tar.gz";
	} else if (plat === "darwin" && ar === "arm64") {
		archiveName = "whisper-cli-darwin-arm64.tar.gz";
	} else if (plat === "darwin" && ar === "x64") {
		archiveName = "whisper-cli-darwin-x64.tar.gz";
	} else if (plat === "win32" && ar === "x64") {
		archiveName = "whisper-cli-win32-x64.zip";
	} else {
		// Fallback: try linux x64 — will fail at runtime but provides a clear error
		archiveName = "whisper-cli-linux-x64.tar.gz";
	}

	const isTarGz = archiveName.endsWith(".tar.gz");

	return {
		baseDir,
		binaryPath: join(binDir, binaryFilename),
		modelDir,
		archiveName,
		isTarGz,
		binaryFilename,
	};
}

export class AutoSetup {
	/**
	 * Check if setup is needed — returns true if whisper-cli or model is missing.
	 */
	static needsSetup(settings: WhisperLocalSettings): boolean {
		const needsBinary =
			!settings.whisperPath || !existsSync(settings.whisperPath);
		const needsModel =
			!settings.modelPath || !existsSync(settings.modelPath);
		return needsBinary || needsModel;
	}

	/**
	 * Run the full automatic setup.
	 *
	 * Downloads pre-built binary and model. No build tools required.
	 *
	 * @param settings - Current plugin settings (will be mutated with new paths)
	 * @param onProgress - Callback for progress messages
	 * @returns Updated settings object
	 */
	static async run(
		settings: WhisperLocalSettings,
		onProgress?: SetupProgressCallback
	): Promise<WhisperLocalSettings> {
		const progress = onProgress || (() => {});
		const info = getPlatformInfo();

		// Ensure directories exist
		mkdirSync(join(info.baseDir, "bin"), { recursive: true });
		mkdirSync(info.modelDir, { recursive: true });

		// ── Step 1: Download whisper-cli binary if missing ────
		const needsBinary =
			!settings.whisperPath || !existsSync(settings.whisperPath);
		if (needsBinary) {
			if (existsSync(info.binaryPath)) {
				progress("Found previously installed whisper-cli");
				settings.whisperPath = info.binaryPath;
			} else {
				progress("Downloading whisper-cli...");
				await this.downloadBinary(info, progress);
				settings.whisperPath = info.binaryPath;
			}
		}

		// ── Step 2: Download model if missing ────────────────
		const needsModel =
			!settings.modelPath || !existsSync(settings.modelPath);
		if (needsModel) {
			const modelPath = join(info.modelDir, "ggml-tiny.bin");
			if (existsSync(modelPath)) {
				progress("Found existing model");
				settings.modelPath = modelPath;
			} else {
				progress("Downloading speech model (75 MB)...");
				const downloaded = await ModelDownloader.download(
					"tiny",
					info.modelDir,
					(p: DownloadProgress) => {
						if (!isNaN(p.percent)) {
							progress(
								`Downloading model... ${Math.round(p.percent)}%`
							);
						}
					}
				);
				settings.modelPath = downloaded;
			}
		}

		settings.setupComplete = true;
		return settings;
	}

	/**
	 * Download and extract the pre-built whisper-cli binary.
	 */
	private static async downloadBinary(
		info: PlatformInfo,
		progress: SetupProgressCallback
	): Promise<void> {
		const url = `${GITHUB_RELEASE_BASE}/${info.archiveName}`;
		const tempDir = join(tmpdir(), "whisper-local-download");
		const tempArchive = join(tempDir, info.archiveName);

		// Clean up any previous failed download
		if (existsSync(tempDir)) {
			const { rmSync } = require("fs");
			rmSync(tempDir, { recursive: true, force: true });
		}
		mkdirSync(tempDir, { recursive: true });

		try {
			// Download archive
			progress("Downloading whisper-cli binary...");
			await this.downloadFile(url, tempArchive, (percent) => {
				progress(`Downloading whisper-cli... ${Math.round(percent)}%`);
			});

			// Extract
			progress("Extracting whisper-cli...");
			const binDir = join(info.baseDir, "bin");

			if (info.isTarGz) {
				// Linux/Mac: use tar
				await this.exec("tar", ["xzf", tempArchive, "-C", binDir]);
			} else {
				// Windows: use PowerShell Expand-Archive
				await this.exec("powershell", [
					"-NoProfile",
					"-Command",
					`Expand-Archive -Path '${tempArchive}' -DestinationPath '${binDir}' -Force`,
				]);
			}

			// Verify binary exists
			if (!existsSync(info.binaryPath)) {
				throw new Error(
					`Binary not found after extraction at ${info.binaryPath}`
				);
			}

			// Make executable on Linux/Mac
			if (platform() !== "win32") {
				chmodSync(info.binaryPath, 0o755);
			}

			progress("whisper-cli installed successfully");
		} finally {
			// Clean up temp directory
			try {
				const { rmSync } = require("fs");
				rmSync(tempDir, { recursive: true, force: true });
			} catch {
				// Ignore cleanup errors
			}
		}
	}

	/**
	 * Download a file from a URL to a local path.
	 * Follows up to 5 redirects (GitHub → CDN).
	 * Reports progress as 0-100 percentage.
	 */
	private static downloadFile(
		url: string,
		destPath: string,
		onProgress?: (percent: number) => void
	): Promise<void> {
		return new Promise((resolve, reject) => {
			const followRedirects = (
				currentUrl: string,
				maxRedirects = 5
			) => {
				if (maxRedirects <= 0) {
					reject(new Error("Too many redirects"));
					return;
				}

				// Pick http or https based on URL
				const httpModule = currentUrl.startsWith("https")
					? (require("https") as typeof import("https"))
					: (require("http") as typeof import("http"));

				httpModule
					.get(currentUrl, (response: IncomingMessage) => {
						// Follow redirects
						if (
							response.statusCode &&
							response.statusCode >= 300 &&
							response.statusCode < 400 &&
							response.headers.location
						) {
							followRedirects(
								response.headers.location,
								maxRedirects - 1
							);
							return;
						}

						if (response.statusCode !== 200) {
							reject(
								new Error(
									`Download failed: HTTP ${response.statusCode}`
								)
							);
							return;
						}

						const total = parseInt(
							response.headers["content-length"] || "0",
							10
						);
						let loaded = 0;

						const fileStream = createWriteStream(destPath);

						response.on("data", (chunk: Buffer) => {
							loaded += chunk.length;
							if (onProgress && total > 0) {
								onProgress((loaded / total) * 100);
							}
						});

						response.pipe(fileStream);

						fileStream.on("finish", () => {
							fileStream.close(() => resolve());
						});

						fileStream.on("error", (err: Error) => {
							try {
								unlinkSync(destPath);
							} catch {
								// Ignore
							}
							reject(err);
						});
					})
					.on("error", reject);
			};

			followRedirects(url);
		});
	}

	/**
	 * Execute a command and return a promise.
	 * Rejects with a descriptive error on non-zero exit.
	 */
	private static exec(
		command: string,
		args: string[],
		options?: { cwd?: string; timeout?: number }
	): Promise<string> {
		return new Promise((resolve, reject) => {
			execFile(
				command,
				args,
				{
					cwd: options?.cwd,
					timeout: options?.timeout || 60000, // 1 minute default
					maxBuffer: 10 * 1024 * 1024,
				},
				(error, stdout, stderr) => {
					if (error) {
						const detail = stderr
							? stderr.trim().split("\n").slice(-5).join("\n")
							: error.message;
						reject(new Error(`${command} failed: ${detail}`));
					} else {
						resolve(stdout);
					}
				}
			);
		});
	}
}
