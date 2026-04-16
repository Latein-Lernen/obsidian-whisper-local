/**
 * Wrapper around the MediaRecorder API for capturing microphone audio.
 *
 * Handles getUserMedia, recording lifecycle, and cleanup.
 * Produces a Blob (WebM/Opus) that can be passed to AudioConverter.
 */

export class VoiceRecorder {
	private mediaRecorder: MediaRecorder | null = null;
	private stream: MediaStream | null = null;
	private chunks: Blob[] = [];
	private _isRecording = false;

	/** True while actively recording audio */
	get isRecording(): boolean {
		return this._isRecording;
	}

	/**
	 * Start capturing audio from the default microphone.
	 * Throws if microphone access is denied.
	 */
	async start(): Promise<void> {
		if (this._isRecording) return;

		this.chunks = [];

		// Request microphone access
		this.stream = await navigator.mediaDevices.getUserMedia({
			audio: {
				channelCount: 1,
				sampleRate: { ideal: 16000 },
				echoCancellation: true,
				noiseSuppression: true,
			},
		});

		// Pick the best available container format
		const mimeType = this.selectMimeType();

		this.mediaRecorder = new MediaRecorder(this.stream, {
			mimeType,
		});

		this.mediaRecorder.ondataavailable = (e: BlobEvent) => {
			if (e.data && e.data.size > 0) {
				this.chunks.push(e.data);
			}
		};

		this.mediaRecorder.start();
		this._isRecording = true;
	}

	/**
	 * Stop recording and return the captured audio as a Blob.
	 * Returns null if no audio was captured.
	 */
	async stop(): Promise<Blob | null> {
		if (!this.mediaRecorder || !this._isRecording) return null;

		return new Promise<Blob | null>((resolve) => {
			const recorder = this.mediaRecorder!;

			recorder.onstop = () => {
				this.releaseStream();
				this._isRecording = false;

				if (this.chunks.length === 0) {
					resolve(null);
					return;
				}

				const blob = new Blob(this.chunks, {
					type: recorder.mimeType,
				});
				this.chunks = [];
				resolve(blob);
			};

			recorder.stop();
		});
	}

	/**
	 * Cancel an active recording without producing output.
	 */
	cancel(): void {
		if (this.mediaRecorder && this._isRecording) {
			try {
				this.mediaRecorder.stop();
			} catch {
				// Already stopped
			}
		}
		this.releaseStream();
		this.chunks = [];
		this._isRecording = false;
	}

	/**
	 * Release the microphone stream to free the hardware.
	 */
	private releaseStream(): void {
		if (this.stream) {
			this.stream.getTracks().forEach((t) => t.stop());
			this.stream = null;
		}
		this.mediaRecorder = null;
	}

	/**
	 * Select the best available audio MIME type for MediaRecorder.
	 * Prefers WebM/Opus (best Chromium support).
	 */
	private selectMimeType(): string {
		const candidates = [
			"audio/webm;codecs=opus",
			"audio/webm",
			"audio/ogg;codecs=opus",
		];

		for (const type of candidates) {
			if (MediaRecorder.isTypeSupported(type)) {
				return type;
			}
		}

		// Fallback: let the browser pick
		return "";
	}
}
