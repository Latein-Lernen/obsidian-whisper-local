/**
 * Downloads whisper GGML model files from HuggingFace.
 *
 * Provides progress callbacks for UI integration and supports
 * cancellation. Downloads to a configurable directory.
 */

import { existsSync, mkdirSync, createWriteStream, unlinkSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";
import { IncomingMessage } from "http";

import { MODEL_DOWNLOAD_BASE, MODEL_SEARCH_DIRS } from "./constants";

export interface DownloadProgress {
	/** Bytes downloaded so far */
	loaded: number;
	/** Total file size in bytes (0 if unknown) */
	total: number;
	/** Progress as 0-100 percentage (NaN if total unknown) */
	percent: number;
}

export class ModelDownloader {
	/**
	 * Get the default directory for storing models.
	 * Creates it if it does not exist.
	 */
	static getDefaultModelDir(): string {
		const dir = join(homedir(), MODEL_SEARCH_DIRS[0]);
		if (!existsSync(dir)) {
			mkdirSync(dir, { recursive: true });
		}
		return dir;
	}

	/**
	 * Download a model file from HuggingFace.
	 *
	 * @param modelId - Model identifier (e.g. "small", "base", "large-v3")
	 * @param targetDir - Directory to save the file to
	 * @param onProgress - Callback for download progress updates
	 * @param abortSignal - Optional AbortController signal for cancellation
	 * @returns The absolute path to the downloaded model file
	 */
	static async download(
		modelId: string,
		targetDir: string,
		onProgress?: (progress: DownloadProgress) => void,
		abortSignal?: AbortSignal
	): Promise<string> {
		const filename = `ggml-${modelId}.bin`;
		const url = `${MODEL_DOWNLOAD_BASE}/${filename}`;
		const targetPath = join(targetDir, filename);
		const tempPath = targetPath + ".download";

		// Ensure target directory exists
		const dir = dirname(targetPath);
		if (!existsSync(dir)) {
			mkdirSync(dir, { recursive: true });
		}

		// Skip if already downloaded
		if (existsSync(targetPath)) {
			return targetPath;
		}

		// Use Node.js https for reliable downloads with progress
		const https = require("https") as typeof import("https");

		return new Promise<string>((resolve, reject) => {
			const followRedirects = (
				currentUrl: string,
				maxRedirects = 5
			) => {
				if (maxRedirects <= 0) {
					reject(new Error("Too many redirects"));
					return;
				}

				https
					.get(currentUrl, (response: IncomingMessage) => {
						if (
							response.statusCode &&
							response.statusCode >= 300 &&
							response.statusCode < 400 &&
							response.headers.location
						) {
							// Follow redirect (HuggingFace sometimes chains multiple)
							followRedirects(
								response.headers.location,
								maxRedirects - 1
							);
							return;
						}

						this.handleResponse(
							response,
							tempPath,
							targetPath,
							onProgress,
							abortSignal,
							resolve,
							reject
						);
					})
					.on("error", reject);
			};

			// Handle abort
			if (abortSignal) {
				abortSignal.addEventListener("abort", () => {
					this.cleanupTemp(tempPath);
					reject(new Error("Download cancelled"));
				});
			}

			followRedirects(url);
		});
	}

	/**
	 * Handle the HTTP response: stream to file with progress tracking.
	 */
	private static handleResponse(
		response: IncomingMessage,
		tempPath: string,
		targetPath: string,
		onProgress: ((progress: DownloadProgress) => void) | undefined,
		abortSignal: AbortSignal | undefined,
		resolve: (path: string) => void,
		reject: (err: Error) => void
	): void {
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

		const fileStream = createWriteStream(tempPath);

		response.on("data", (chunk: Buffer) => {
			loaded += chunk.length;
			if (onProgress) {
				onProgress({
					loaded,
					total,
					percent: total > 0 ? (loaded / total) * 100 : NaN,
				});
			}
		});

		response.pipe(fileStream);

		fileStream.on("finish", () => {
			fileStream.close(() => {
				// Rename temp file to final name
				try {
					const { renameSync } = require("fs");
					renameSync(tempPath, targetPath);
					resolve(targetPath);
				} catch (err) {
					reject(
						err instanceof Error
							? err
							: new Error(String(err))
					);
				}
			});
		});

		fileStream.on("error", (err: Error) => {
			this.cleanupTemp(tempPath);
			reject(err);
		});

		// Handle abort during download
		if (abortSignal) {
			abortSignal.addEventListener("abort", () => {
				response.destroy();
				fileStream.close();
				this.cleanupTemp(tempPath);
			});
		}
	}

	/**
	 * Remove a temporary download file if it exists.
	 */
	private static cleanupTemp(path: string): void {
		try {
			unlinkSync(path);
		} catch {
			// Ignore
		}
	}
}
