/**
 * Auto-detection of whisper-cli binaries and model files.
 *
 * Searches common installation paths across Linux distributions
 * (NixOS, Ubuntu, Arch, Fedora) and macOS (Homebrew).
 */

import { existsSync, readdirSync, statSync } from "fs";
import { execFile } from "child_process";
import { join } from "path";
import { homedir, userInfo } from "os";

import { WHISPER_SEARCH_PATHS, MODEL_SEARCH_DIRS } from "./constants";

export class BinaryDetector {
	/**
	 * Try to find whisper-cli on the system.
	 * Returns the absolute path if found, null otherwise.
	 */
	static findWhisper(): string | null {
		const home = homedir();

		// 1. Check paths relative to $HOME
		for (const rel of WHISPER_SEARCH_PATHS) {
			if (rel.startsWith("/")) {
				// Absolute path
				if (existsSync(rel)) return rel;
			} else {
				const abs = join(home, rel);
				if (existsSync(abs)) return abs;
			}
		}

		// 2. NixOS: /etc/profiles/per-user/<username>/bin/whisper-cli
		try {
			const username = userInfo().username;
			const nixSystemPath = `/etc/profiles/per-user/${username}/bin/whisper-cli`;
			if (existsSync(nixSystemPath)) return nixSystemPath;
		} catch {
			// userInfo() can fail in sandboxed environments
		}

		// 3. Fallback: use `which` to search PATH
		return this.which("whisper-cli");
	}

	/**
	 * Search for model files in common locations.
	 * Returns an array of { path, name, sizeMB } for all found models,
	 * sorted by preference (small > base > tiny > others).
	 */
	static findModels(): { path: string; name: string; sizeMB: number }[] {
		const home = homedir();
		const found: { path: string; name: string; sizeMB: number }[] = [];
		const seen = new Set<string>();

		for (const dir of MODEL_SEARCH_DIRS) {
			const absDir = dir.startsWith("/") ? dir : join(home, dir);
			if (!existsSync(absDir)) continue;

			try {
				const files = readdirSync(absDir);
				for (const file of files) {
					if (!file.startsWith("ggml-") || !file.endsWith(".bin"))
						continue;
					const fullPath = join(absDir, file);
					if (seen.has(fullPath)) continue;
					seen.add(fullPath);

					// Extract model name from filename (e.g. "ggml-small.bin" → "small")
					const name = file
						.replace("ggml-", "")
						.replace(".bin", "");

					// Get file size
					let sizeMB = 0;
					try {
						sizeMB = Math.round(
							statSync(fullPath).size / (1024 * 1024)
						);
					} catch {
						// Ignore stat errors
					}

					found.push({ path: fullPath, name, sizeMB });
				}
			} catch {
				// Directory not readable
			}
		}

		// Sort: prefer small > base > medium > large > tiny > others
		const preference: Record<string, number> = {
			small: 0,
			base: 1,
			medium: 2,
			"large-v3-turbo": 3,
			"large-v3": 4,
			"large-v2": 5,
			"large-v1": 6,
			tiny: 7,
		};

		found.sort((a, b) => {
			const pa = preference[a.name] ?? 99;
			const pb = preference[b.name] ?? 99;
			return pa - pb;
		});

		return found;
	}

	/**
	 * Get GPU info by running whisper-cli --help and parsing stderr.
	 * Returns a human-readable string like "NVIDIA GeForce RTX 5090 (Vulkan)".
	 */
	static async getGpuInfo(whisperPath: string): Promise<string> {
		return new Promise((resolve) => {
			execFile(
				whisperPath,
				["--help"],
				{ timeout: 5000 },
				(_err, _stdout, stderr) => {
					// whisper-cli prints backend info to stderr on startup
					const lines = (stderr || "").split("\n");
					const gpuLines: string[] = [];

					for (const line of lines) {
						// Vulkan backend
						const vulkanMatch = line.match(
							/ggml_vulkan:\s*\d+\s*=\s*(.+?)\s*\(/
						);
						if (vulkanMatch) {
							gpuLines.push(
								`${vulkanMatch[1].trim()} (Vulkan)`
							);
						}

						// CUDA backend
						const cudaMatch = line.match(
							/ggml_cuda:\s*device\s*\d+\s*=\s*(.+)/i
						);
						if (cudaMatch) {
							gpuLines.push(`${cudaMatch[1].trim()} (CUDA)`);
						}
					}

					if (gpuLines.length > 0) {
						// Return only real GPUs, not integrated
						const realGpus = gpuLines.filter(
							(g) =>
								!g.includes("Radeon Graphics (Vulkan)") &&
								!g.includes("llvmpipe")
						);
						resolve(
							realGpus.length > 0
								? realGpus.join(", ")
								: gpuLines[0]
						);
					} else {
						resolve("CPU only");
					}
				}
			);
		});
	}

	/**
	 * Simple `which` implementation using child_process.
	 */
	private static which(binary: string): string | null {
		try {
			const { execFileSync } = require("child_process");
			const result = execFileSync("which", [binary], {
				encoding: "utf8",
				timeout: 3000,
			}).trim();
			return result || null;
		} catch {
			return null;
		}
	}
}
