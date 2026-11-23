import { get } from 'svelte/store';
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { canPlayRecording, commonsAudioUrl, isVietnameseVoice, pickVoice } from './audio';

const voice = (voiceURI: string, lang: string) => ({ voiceURI, lang });
// The module reads only lang and voiceURI and hands the voice to the (stubbed) utterance.
const viVoice = voice('vi-1', 'vi-VN') as unknown as SpeechSynthesisVoice;

/** A fresh copy of the module, so the shared player and the voice store start over in each test. */
async function freshAudio() {
  vi.resetModules();
  return import('./audio');
}

/**
 * Stand-ins for the audio element and speech, like iPhone Safari (no Ogg), logging what the module does. A recording
 * named `missing…` fails to load a moment later, one named `slow…` keeps loading, and any other plays.
 */
function stubSound() {
  const log: string[] = [];
  let voices: ReturnType<typeof voice>[] = [];
  let interrupt = () => {};
  vi.stubGlobal(
    'Audio',
    class {
      src = '';
      canPlayType(type: string) {
        return type.startsWith('audio/ogg') ? '' : 'maybe';
      }
      pause() {
        log.push('pause');
        interrupt();
      }
      play() {
        const file = this.src.split('/').pop()!;
        log.push(`play ${file}`);
        return new Promise<void>((resolve, reject) => {
          interrupt = () => reject(new DOMException('The play() request was interrupted', 'AbortError'));
          if (file.startsWith('missing')) setTimeout(() => reject(new DOMException('No supported source', 'NotSupportedError')));
          else if (!file.startsWith('slow')) resolve();
        });
      }
    },
  );
  vi.stubGlobal(
    'SpeechSynthesisUtterance',
    class {
      text: string;
      voice: unknown = null;
      lang = '';
      constructor(text: string) {
        this.text = text;
      }
    },
  );
  const synth = Object.assign(new EventTarget(), {
    getVoices: () => voices,
    speak: (utterance: { text: string }) => log.push(`speak ${utterance.text}`.trim()),
    cancel: () => log.push('cancel'),
  });
  vi.stubGlobal('speechSynthesis', synth);
  return {
    log,
    setVoices: (next: ReturnType<typeof voice>[]) => {
      voices = next;
    },
    fireVoicesChanged: () => synth.dispatchEvent(new Event('voiceschanged')),
  };
}

/** The log entries that make a sound. */
const sounds = (log: string[]) => log.filter((entry) => entry.startsWith('speak') || entry.startsWith('play'));

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('commonsAudioUrl', () => {
  it('points at Special:FilePath with underscores, percent-encoded', () => {
    expect(commonsAudioUrl('LL-Q9199 (vie)-Penn Zero MSSJ-thành phố.wav')).toBe(
      'https://commons.wikimedia.org/wiki/Special:FilePath/LL-Q9199_(vie)-Penn_Zero_MSSJ-th%C3%A0nh_ph%E1%BB%91.wav',
    );
  });
});

describe('canPlayRecording', () => {
  // Like iPhone Safari, which plays WAV and MP3 but not Ogg.
  const noOgg = (type: string) => (type.startsWith('audio/ogg') ? '' : 'maybe');

  it("is false for a type this browser can't play", () => {
    expect(canPlayRecording('Hà Nội.ogg', noOgg)).toBe(false);
    expect(canPlayRecording('x.OGA', noOgg)).toBe(false);
    expect(canPlayRecording('x.opus', noOgg)).toBe(false);
    expect(canPlayRecording('LL-Q9199 (vie)-Penn Zero MSSJ-thành phố.wav', noOgg)).toBe(true);
    expect(canPlayRecording('x.mp3', noOgg)).toBe(true);
  });

  it('tries files of an unknown type', () => {
    expect(canPlayRecording('x.xyz', () => '')).toBe(true);
    expect(canPlayRecording('no extension', () => '')).toBe(true);
  });
});

describe('playRecording', () => {
  it('lets a newer recording interrupt the one playing, and rejects on real failures', async () => {
    stubSound();
    const { playRecording } = await freshAudio();
    const first = playRecording('slow.wav');
    await playRecording('b.wav');
    await expect(first).resolves.toBeUndefined();
    await expect(playRecording('missing.wav')).rejects.toThrow('No supported source');
  });

  it('stops speech before playing, and speech stops the recording', async () => {
    const { log } = stubSound();
    const { playRecording, speak } = await freshAudio();
    const loading = playRecording('slow.wav');
    speak('nước', viVoice);
    await expect(loading).resolves.toBeUndefined();
    expect(log).toEqual(['cancel', 'play slow.wav', 'pause', 'cancel', 'speak nước']);
  });
});

describe('pronounce', () => {
  it('speaks within the tap when no recording can play here', async () => {
    const { log } = stubSound();
    const { pronounce } = await freshAudio();
    const heard = pronounce('nước', 'Hà Nội.ogg', viVoice);
    // Spoken before the tap's handler returns (iOS ignores speech started later), and the file isn't tried.
    expect(sounds(log)).toEqual(['speak nước']);
    await expect(heard).resolves.toBe('voice');
    await expect(pronounce('nước', undefined, viVoice)).resolves.toBe('voice');
    await expect(pronounce('nước', undefined, null)).resolves.toBe('silent');
  });

  it('unlocks speech within the tap, then plays the recording', async () => {
    const { log } = stubSound();
    const { pronounce } = await freshAudio();
    const first = pronounce('nước', 'slow.wav', viVoice);
    // The empty utterance, started during the tap, lets a later fallback speak on iOS.
    expect(sounds(log)).toEqual(['speak', 'play slow.wav']);
    await expect(pronounce('nước', 'a.wav', viVoice)).resolves.toBe('recording');
    // Interrupted, not failed: no voice over the newer recording.
    await expect(first).resolves.toBe('recording');
    expect(sounds(log)).toEqual(['speak', 'play slow.wav', 'speak', 'play a.wav']);
  });

  it('speaks instead of a recording that fails, or reports silence without a voice', async () => {
    const { log } = stubSound();
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { pronounce } = await freshAudio();
    await expect(pronounce('nước', 'missing.wav', viVoice)).resolves.toBe('voice-instead');
    expect(sounds(log)).toEqual(['speak', 'play missing.wav', 'speak nước']);
    await expect(pronounce('nước', 'missing.wav', null)).resolves.toBe('silent');
    // Without a voice nothing speaks, not even the empty utterance: the Recording row passes a null voice.
    expect(sounds(log)).toEqual(['speak', 'play missing.wav', 'speak nước', 'play missing.wav']);
    expect(logged).toHaveBeenCalledTimes(2);
  });
});

describe('voices', () => {
  const voices = [voice('en', 'en-US'), voice('vi-1', 'vi-VN'), voice('vi-2', 'vi_VN')];

  it('recognizes Vietnamese voices by language', () => {
    expect(voices.filter(isVietnameseVoice).map((v) => v.voiceURI)).toEqual(['vi-1', 'vi-2']);
  });

  it('prefers the saved voice, else the first Vietnamese one', () => {
    expect(pickVoice(voices, 'vi-2')?.voiceURI).toBe('vi-2');
    expect(pickVoice(voices, 'uninstalled')?.voiceURI).toBe('vi-1');
    expect(pickVoice(voices, null)?.voiceURI).toBe('vi-1');
    expect(pickVoice([voice('en', 'en-US')], null)).toBeNull();
  });

});

describe('vietnameseVoices', () => {
  it('updates on voiceschanged, and again later for browsers that never fire it', async () => {
    const speech = stubSound();
    const { vietnameseVoices } = await freshAudio();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const seen: string[][] = [];
    onTestFinished(vietnameseVoices.subscribe((list) => seen.push(list.map((v) => v.voiceURI))));
    speech.setVoices([voice('en', 'en-US'), voice('vi-1', 'vi-VN')]);
    speech.fireVoicesChanged();
    expect(seen).toEqual([[], ['vi-1']]);
    speech.setVoices([voice('en', 'en-US'), voice('vi-1', 'vi-VN'), voice('vi-2', 'vi-VN')]);
    vi.advanceTimersByTime(3000);
    expect(seen.at(-1)).toEqual(['vi-1', 'vi-2']);
  });

  it('lists a voice once when the browser lists it twice', async () => {
    const speech = stubSound();
    const { vietnameseVoices } = await freshAudio();
    speech.setVoices([voice('vi-1', 'vi-VN'), voice('vi-1', 'vi-VN'), voice('vi-2', 'vi-VN')]);
    const seen: string[][] = [];
    onTestFinished(vietnameseVoices.subscribe((list) => seen.push(list.map((v) => v.voiceURI))));
    expect(seen).toEqual([['vi-1', 'vi-2']]);
  });

  it('stops listening and clears its retries when unsubscribed', async () => {
    const speech = stubSound();
    const { vietnameseVoices } = await freshAudio();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const seen: string[][] = [];
    const stop = vietnameseVoices.subscribe((list) => seen.push(list.map((v) => v.voiceURI)));
    stop();
    expect(vi.getTimerCount()).toBe(0);
    speech.setVoices([voice('vi-1', 'vi-VN')]);
    speech.fireVoicesChanged();
    expect(seen).toEqual([[]]);
  });

  it('asks for the voices as it loads, so they are ready by the first word review plays', async () => {
    stubSound();
    let asked = 0;
    // Chromium answers the first request with no voices and loads them in the background.
    speechSynthesis.getVoices = () => (asked++ === 0 ? [] : [viVoice]);
    const { chosenVoice } = await freshAudio();
    expect(get(chosenVoice)).toBe(viVoice);
  });
});

describe('device settings', () => {
  it('reads with the chosen voice while it is installed, else the first Vietnamese one', async () => {
    const speech = stubSound();
    speech.setVoices([voice('en', 'en-US'), voice('vi-1', 'vi-VN'), voice('vi-2', 'vi-VN')]);
    const { chosenVoice, chosenVoiceUri } = await freshAudio();
    const seen: (string | undefined)[] = [];
    onTestFinished(chosenVoice.subscribe((v) => seen.push(v?.voiceURI)));
    chosenVoiceUri.set('vi-2');
    expect(localStorage.getItem('vv.audio.voice')).toBe('vi-2');
    chosenVoiceUri.set('uninstalled');
    expect(seen).toEqual(['vi-1', 'vi-2', 'vi-1']);
  });

  it('switches to the saved voice when the voices arrive late, as on Android', async () => {
    const speech = stubSound();
    localStorage.setItem('vv.audio.voice', 'vi-2');
    const { chosenVoice } = await freshAudio();
    const seen: (string | undefined)[] = [];
    onTestFinished(chosenVoice.subscribe((v) => seen.push(v?.voiceURI)));
    speech.setVoices([voice('vi-1', 'vi-VN'), voice('vi-2', 'vi-VN')]);
    speech.fireVoicesChanged();
    expect(seen).toEqual([undefined, 'vi-2']);
  });

  it('remembers the chosen voice on this device, and forgets it when set to none', async () => {
    const { chosenVoiceUri } = await freshAudio();
    expect(chosenVoiceUri.get()).toBeNull();
    chosenVoiceUri.set('vi-2');
    expect(localStorage.getItem('vv.audio.voice')).toBe('vi-2');
    chosenVoiceUri.set(null);
    expect(localStorage.getItem('vv.audio.voice')).toBeNull();
  });

  it('plays words during review unless autoplay is turned off on this device', async () => {
    const { autoplay } = await freshAudio();
    const seen: boolean[] = [];
    onTestFinished(autoplay.subscribe((on) => seen.push(on)));
    autoplay.set(false);
    expect(localStorage.getItem('vv.review.autoplay')).toBe('off');
    autoplay.set(true);
    expect(localStorage.getItem('vv.review.autoplay')).toBeNull();
    expect(seen).toEqual([true, false, true]);
  });
});
