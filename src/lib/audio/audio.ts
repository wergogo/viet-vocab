import { readable, type Readable } from 'svelte/store';

/** Commons serves a file's bytes at Special:FilePath (spec §9). */
export function commonsAudioUrl(file: string): string {
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file.replaceAll(' ', '_'))}`;
}

/** Media types of the audio files Commons hosts, by file extension. */
const AUDIO_TYPES: Record<string, string> = {
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/ogg; codecs=opus',
  wav: 'audio/wav',
  mp3: 'audio/mpeg',
  flac: 'audio/flac',
  webm: 'audio/webm',
};

// One player for every recording, so a second tap restarts the sound instead of playing over the first.
let player: HTMLAudioElement | undefined;
const audioElement = (): HTMLAudioElement => (player ??= new Audio());

/**
 * Whether this browser can play the file's type. iPhone Safari can't play Ogg, and many Commons recordings are Ogg,
 * so the audio button checks first and uses the device voice within the same tap. Files of an unknown type are tried.
 */
export function canPlayRecording(
  file: string,
  canPlayType: (type: string) => string = (type) => audioElement().canPlayType(type),
): boolean {
  const extension = /\.([a-z\d]+)$/i.exec(file)?.[1]?.toLowerCase();
  const type = extension ? AUDIO_TYPES[extension] : undefined;
  return type === undefined || canPlayType(type) !== '';
}

/** Stops the recording or speech that is playing, so sounds never overlap. */
function stopSound(): void {
  player?.pause();
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
}

/**
 * Plays a Commons recording. Rejects when it can't play (offline, missing file, blocked autoplay). A play that a newer
 * one interrupts resolves quietly: nothing failed, so the caller shouldn't fall back to the voice.
 */
export async function playRecording(file: string): Promise<void> {
  stopSound();
  const audio = audioElement();
  audio.src = commonsAudioUrl(file);
  try {
    await audio.play();
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') return;
    throw e;
  }
}

const VOICE_KEY = 'vv.audio.voice';

/** The voice chosen in Settings on this device, or null (spec §4.3: chosen voice lives in localStorage). */
export function savedVoiceUri(): string | null {
  try {
    return localStorage.getItem(VOICE_KEY);
  } catch {
    return null;
  }
}

export function saveVoiceUri(uri: string | null): void {
  try {
    if (uri) localStorage.setItem(VOICE_KEY, uri);
    else localStorage.removeItem(VOICE_KEY);
  } catch {
    // A per-device convenience: without storage the first Vietnamese voice is used.
  }
}

export function isVietnameseVoice(voice: { lang: string }): boolean {
  return voice.lang.toLowerCase().startsWith('vi');
}

/** The saved voice when it is still installed, else the first Vietnamese voice, else null (spec §9). */
export function pickVoice<V extends { lang: string; voiceURI: string }>(
  voices: readonly V[],
  savedUri: string | null,
): V | null {
  const vietnamese = voices.filter(isVietnameseVoice);
  return vietnamese.find((v) => v.voiceURI === savedUri) ?? vietnamese[0] ?? null;
}

/** When to read the voice list again, for browsers that fill it late without firing `voiceschanged`. */
const VOICE_RETRIES_MS = [250, 1000, 3000];

/** The device's Vietnamese voices. Browsers load voices asynchronously, so this updates on `voiceschanged`. */
export const vietnameseVoices: Readable<SpeechSynthesisVoice[]> = readable<SpeechSynthesisVoice[]>([], (set) => {
  if (typeof speechSynthesis === 'undefined') return;
  const update = () => set(speechSynthesis.getVoices().filter(isVietnameseVoice));
  update();
  speechSynthesis.addEventListener('voiceschanged', update);
  const retries = VOICE_RETRIES_MS.map((ms) => setTimeout(update, ms));
  return () => {
    speechSynthesis.removeEventListener('voiceschanged', update);
    for (const id of retries) clearTimeout(id);
  };
});

/** Speaks the text with the voice, stopping any recording or speech still playing. */
export function speak(text: string, voice: SpeechSynthesisVoice): void {
  stopSound();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.voice = voice;
  utterance.lang = voice.lang;
  speechSynthesis.speak(utterance);
}
