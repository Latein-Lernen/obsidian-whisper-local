/**
 * Plugin settings interface and defaults.
 */
export interface WhisperLocalSettings {
	/** Absolute path to the whisper-cli binary */
	whisperPath: string;
	/** Absolute path to the GGML model file */
	modelPath: string;
	/** Language code for transcription (e.g. "de", "en", "auto") */
	language: string;
	/** Number of CPU threads for whisper (0 = auto) */
	threads: number;
	/** Disable GPU acceleration */
	noGpu: boolean;
	/** Whether the first-run setup wizard has been completed */
	setupComplete: boolean;
	/** Automatically send the message after transcription */
	autoSend: boolean;
}

export const DEFAULT_SETTINGS: WhisperLocalSettings = {
	whisperPath: "",
	modelPath: "",
	language: "de",
	threads: 0,
	noGpu: false,
	setupComplete: false,
	autoSend: false,
};
