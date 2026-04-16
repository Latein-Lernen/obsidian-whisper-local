/**
 * Converts audio blobs to 16kHz mono WAV using the Web Audio API.
 *
 * This replaces the need for an external ffmpeg binary.
 * Works in Electron (Obsidian) because Chromium provides
 * AudioContext and OfflineAudioContext.
 */

import { WHISPER_SAMPLE_RATE } from "./constants";

/**
 * Convert an audio Blob (typically WebM/Opus from MediaRecorder)
 * to a 16kHz mono WAV ArrayBuffer suitable for whisper-cli.
 */
export async function convertBlobToWav(blob: Blob): Promise<ArrayBuffer> {
	// 1. Decode the audio blob into raw PCM samples
	const arrayBuffer = await blob.arrayBuffer();
	const audioCtx = new AudioContext();

	let decoded: AudioBuffer;
	try {
		decoded = await audioCtx.decodeAudioData(arrayBuffer);
	} finally {
		await audioCtx.close();
	}

	// 2. Resample to 16kHz mono using OfflineAudioContext
	const targetLength = Math.ceil(
		decoded.duration * WHISPER_SAMPLE_RATE
	);
	const offlineCtx = new OfflineAudioContext(
		1,
		targetLength,
		WHISPER_SAMPLE_RATE
	);

	const source = offlineCtx.createBufferSource();
	source.buffer = decoded;
	source.connect(offlineCtx.destination);
	source.start(0);

	const resampled = await offlineCtx.startRendering();

	// 3. Encode as WAV
	return encodeWav(resampled);
}

/**
 * Encode an AudioBuffer as a WAV file (PCM 16-bit, little-endian).
 * Returns the complete WAV file as an ArrayBuffer including headers.
 */
function encodeWav(audioBuffer: AudioBuffer): ArrayBuffer {
	const samples = audioBuffer.getChannelData(0);
	const sampleRate = audioBuffer.sampleRate;
	const numChannels = 1;
	const bitDepth = 16;
	const bytesPerSample = bitDepth / 8;
	const dataLength = samples.length * bytesPerSample;
	const headerLength = 44;
	const totalLength = headerLength + dataLength;

	const buffer = new ArrayBuffer(totalLength);
	const view = new DataView(buffer);

	// --- RIFF header ---
	writeString(view, 0, "RIFF");
	view.setUint32(4, totalLength - 8, true); // file size minus RIFF header
	writeString(view, 8, "WAVE");

	// --- fmt sub-chunk ---
	writeString(view, 12, "fmt ");
	view.setUint32(16, 16, true); // sub-chunk size (16 for PCM)
	view.setUint16(20, 1, true); // audio format: 1 = PCM
	view.setUint16(22, numChannels, true);
	view.setUint32(24, sampleRate, true);
	view.setUint32(
		28,
		sampleRate * numChannels * bytesPerSample,
		true
	); // byte rate
	view.setUint16(32, numChannels * bytesPerSample, true); // block align
	view.setUint16(34, bitDepth, true);

	// --- data sub-chunk ---
	writeString(view, 36, "data");
	view.setUint32(40, dataLength, true);

	// --- PCM samples ---
	// Convert float32 [-1.0, 1.0] to int16 [-32768, 32767]
	let offset = headerLength;
	for (let i = 0; i < samples.length; i++) {
		const clamped = Math.max(-1, Math.min(1, samples[i]));
		const int16 =
			clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
		view.setInt16(offset, int16, true);
		offset += bytesPerSample;
	}

	return buffer;
}

/** Write an ASCII string into a DataView at the given offset. */
function writeString(view: DataView, offset: number, str: string): void {
	for (let i = 0; i < str.length; i++) {
		view.setUint8(offset + i, str.charCodeAt(i));
	}
}
