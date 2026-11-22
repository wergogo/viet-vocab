import { derived, readable, writable, type Readable } from 'svelte/store';

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
 * so `pronounce` checks first and uses the device voice within the same tap. Files of an unknown type are tried.
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

/** The first voice per voiceURI: browsers don't promise unique URIs, and iOS lists some voices twice. */
function firstPerUri<V extends { voiceURI: string }>(voices: readonly V[]): V[] {
  const seen = new Set<string>();
  return voices.filter((v) => {
    if (seen.has(v.voiceURI)) return false;
    seen.add(v.voiceURI);
    return true;
  });
}

/**
 * The browser's Vietnamese voices, one per voiceURI. Browsers load voices asynchronously, so this updates on
 * `voiceschanged`.
 */
export const vietnameseVoices: Readable<SpeechSynthesisVoice[]> = readable<SpeechSynthesisVoice[]>([], (set) => {
  if (typeof speechSynthesis === 'undefined') return;
  const synth = speechSynthesis;
  const update = () => set(firstPerUri(synth.getVoices().filter(isVietnameseVoice)));
  update();
  synth.addEventListener('voiceschanged', update);
  const retries = VOICE_RETRIES_MS.map((ms) => setTimeout(update, ms));
  return () => {
    synth.removeEventListener('voiceschanged', update);
    for (const id of retries) clearTimeout(id);
  };
});

// Chromium lists no voices until a page first asks for them, then loads them in the background. Asking at startup
// has them ready by the first word review plays, which reads the voice only inside that tap.
if (typeof speechSynthesis !== 'undefined') speechSynthesis.getVoices();

/** A per-device setting (spec §4.3: localStorage) as a store; `set` saves it. */
export interface DeviceSetting<T> extends Readable<T> {
  set(value: T): void;
}

/** Wraps a localStorage value in a store that also follows changes made in other tabs. */
function deviceSetting<T>(key: string, read: () => T, write: (value: T) => void): DeviceSetting<T> {
  const store = writable<T>(read(), (set) => {
    set(read());
    const onStorage = (e: StorageEvent) => {
      if (e.key === key || e.key === null) set(read());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  });
  return {
    subscribe: store.subscribe,
    set(value: T) {
      write(value);
      store.set(value);
    },
  };
}

/** The voice URI chosen in Settings on this device (null until one is chosen). */
export const chosenVoiceUri = deviceSetting(VOICE_KEY, savedVoiceUri, saveVoiceUri);

/** The voice words are read with: the chosen one while installed, else the first Vietnamese voice (spec §9). */
export const chosenVoice: Readable<SpeechSynthesisVoice | null> = derived(
  [vietnameseVoices, chosenVoiceUri],
  ([voices, uri]) => pickVoice(voices, uri),
);

const AUTOPLAY_KEY = 'vv.review.autoplay';

export function savedAutoplay(): boolean {
  try {
    return localStorage.getItem(AUTOPLAY_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function saveAutoplay(on: boolean): void {
  try {
    if (on) localStorage.removeItem(AUTOPLAY_KEY);
    else localStorage.setItem(AUTOPLAY_KEY, 'off');
  } catch {
    // A per-device convenience: without storage, autoplay stays on.
  }
}

/** Whether review plays each word when it appears (spec §5.6, per device). On unless turned off. */
export const autoplay = deviceSetting(AUTOPLAY_KEY, savedAutoplay, saveAutoplay);

/** Speaks the text with the voice, stopping any recording or speech still playing. */
export function speak(text: string, voice: SpeechSynthesisVoice): void {
  stopSound();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.voice = voice;
  utterance.lang = voice.lang;
  speechSynthesis.speak(utterance);
}

/**
 * What `pronounce` did: played the recording (also when a newer sound interrupted it), spoke because no recording
 * could play here, spoke instead of a recording that failed, or nothing could be heard.
 */
export type Pronounced = 'recording' | 'voice' | 'voice-instead' | 'silent';

/**
 * Spec §9: the recording when this browser can play it, otherwise the voice, which also stands in for a recording that
 * fails (offline, missing file). Call it straight from a tap: iOS only starts speech inside a tap until speech has
 * started inside one, so it starts an empty utterance before the recording loads, and the fallback can still be heard
 * when the failure arrives later. Pass a null voice to only ever play the recording.
 */
export async function pronounce(
  text: string,
  audioFile: string | undefined,
  voice: SpeechSynthesisVoice | null,
): Promise<Pronounced> {
  if (!audioFile || !canPlayRecording(audioFile)) {
    if (!voice) return 'silent';
    speak(text, voice);
    return 'voice';
  }
  if (voice) speechSynthesis.speak(new SpeechSynthesisUtterance(''));
  try {
    await playRecording(audioFile);
    return 'recording';
  } catch (e) {
    console.error(e);
    if (!voice) return 'silent';
    speak(text, voice);
    return 'voice-instead';
  }
}
