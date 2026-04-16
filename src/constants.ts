/**
 * Supported languages for whisper transcription.
 * Subset of the 99 languages whisper supports — most common ones first.
 */
export const LANGUAGES: { value: string; label: string }[] = [
	{ value: "de", label: "Deutsch" },
	{ value: "en", label: "English" },
	{ value: "fr", label: "Fran\u00e7ais" },
	{ value: "es", label: "Espa\u00f1ol" },
	{ value: "it", label: "Italiano" },
	{ value: "pt", label: "Portugu\u00eas" },
	{ value: "nl", label: "Nederlands" },
	{ value: "pl", label: "Polski" },
	{ value: "ru", label: "\u0420\u0443\u0441\u0441\u043a\u0438\u0439" },
	{ value: "uk", label: "\u0423\u043a\u0440\u0430\u0457\u043d\u0441\u044c\u043a\u0430" },
	{ value: "ja", label: "\u65e5\u672c\u8a9e" },
	{ value: "zh", label: "\u4e2d\u6587" },
	{ value: "ko", label: "\ud55c\uad6d\uc5b4" },
	{ value: "tr", label: "T\u00fcrk\u00e7e" },
	{ value: "ar", label: "\u0627\u0644\u0639\u0631\u0628\u064a\u0629" },
	{ value: "sv", label: "Svenska" },
	{ value: "da", label: "Dansk" },
	{ value: "no", label: "Norsk" },
	{ value: "fi", label: "Suomi" },
	{ value: "auto", label: "Auto-detect" },
];

/**
 * Available whisper models with metadata.
 * Sizes are approximate for the full-precision .bin files.
 */
export const MODELS: {
	id: string;
	label: string;
	sizeMB: number;
	description: string;
	recommended?: boolean;
}[] = [
	{
		id: "tiny",
		label: "Tiny",
		sizeMB: 75,
		description: "Fastest, lower quality. Good for quick tests.",
	},
	{
		id: "base",
		label: "Base",
		sizeMB: 142,
		description: "Fast, decent quality for common languages.",
	},
	{
		id: "small",
		label: "Small",
		sizeMB: 465,
		description: "Best balance of speed and quality.",
		recommended: true,
	},
	{
		id: "medium",
		label: "Medium",
		sizeMB: 1500,
		description: "High quality, slower. Needs more RAM.",
	},
	{
		id: "large-v3-turbo",
		label: "Large v3 Turbo",
		sizeMB: 1600,
		description: "Near-best quality, optimized speed.",
	},
	{
		id: "large-v3",
		label: "Large v3",
		sizeMB: 3100,
		description: "Best quality. Needs a strong GPU.",
	},
];

/** Base URL for downloading GGML model files from HuggingFace */
export const MODEL_DOWNLOAD_BASE =
	"https://huggingface.co/ggerganov/whisper.cpp/resolve/main";

/** Auto-setup directories (relative to $HOME, Linux/Mac) */
export const AUTO_SETUP_BASE_DIR = ".local/share/whisper-local";
export const AUTO_SETUP_BIN_DIR = ".local/share/whisper-local/bin";
export const AUTO_SETUP_MODEL_DIR = ".local/share/whisper-local/models";

/**
 * Common locations where whisper-cli might be found on different systems.
 * Checked in order — first match wins.
 * Relative paths are resolved from $HOME (Linux/Mac) or %APPDATA% (Windows).
 */
export const WHISPER_SEARCH_PATHS = [
	// Auto-setup directory — Linux/Mac (our own managed binary)
	".local/share/whisper-local/bin/whisper-cli",
	// Auto-setup directory — Windows (%APPDATA%)
	// Resolved at runtime in BinaryDetector via getWindowsSearchPaths()
	// NixOS user profile
	".nix-profile/bin/whisper-cli",
	// NixOS system profile (resolved at runtime with username)
	// Handled separately in BinaryDetector
	// Manual / source install
	"/usr/local/bin/whisper-cli",
	// Package manager install
	"/usr/bin/whisper-cli",
	// Homebrew (macOS)
	"/opt/homebrew/bin/whisper-cli",
];

/**
 * Windows-specific search paths for whisper-cli.
 * %APPDATA% is resolved at runtime.
 */
export function getWindowsSearchPaths(): string[] {
	const appData = process.env.APPDATA;
	if (!appData) return [];
	const { join } = require("path");
	return [
		join(appData, "whisper-local", "bin", "whisper-cli.exe"),
	];
}

/**
 * Common locations where whisper models might be stored.
 * Relative paths are resolved from $HOME.
 */
export const MODEL_SEARCH_DIRS = [
	// Auto-setup directory (our own managed models)
	".local/share/whisper-local/models",
	".local/share/whisper-cpp/models",
	".cache/whisper",
	"whisper-models",
];

/**
 * Windows-specific model search directories.
 * %APPDATA% is resolved at runtime.
 */
export function getWindowsModelDirs(): string[] {
	const appData = process.env.APPDATA;
	if (!appData) return [];
	const { join } = require("path");
	return [
		join(appData, "whisper-local", "models"),
	];
}

/** Whisper expects 16kHz mono audio */
export const WHISPER_SAMPLE_RATE = 16000;

/** Plugin CSS class prefix */
export const CSS_PREFIX = "whisper-local";
