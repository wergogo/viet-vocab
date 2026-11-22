import { readable, type Readable } from 'svelte/store';

/** Commons serves a file's bytes at Special:FilePath (spec §9). */
export function commonsAudioUrl(file: string): string {
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file.replaceAll(' ', '_'))}`;
}

/** Plays a Commons recording. Rejects when it can't play (offline, missing file, blocked autoplay). */
export async function playRecording(file: string): Promise<void> {
  await new Audio(commonsAudioUrl(file)).play();
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

/** The device's Vietnamese voices. Browsers load voices asynchronously, so this updates on `voiceschanged`. */
export const vietnameseVoices: Readable<SpeechSynthesisVoice[]> = readable<SpeechSynthesisVoice[]>([], (set) => {
  if (typeof speechSynthesis === 'undefined') return;
  const update = () => set(speechSynthesis.getVoices().filter(isVietnameseVoice));
  update();
  speechSynthesis.addEventListener('voiceschanged', update);
  return () => speechSynthesis.removeEventListener('voiceschanged', update);
});

/** Speaks the text with the voice, interrupting anything still speaking. */
export function speak(text: string, voice: SpeechSynthesisVoice): void {
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.voice = voice;
  utterance.lang = voice.lang;
  speechSynthesis.speak(utterance);
}
