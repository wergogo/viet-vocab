import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  canPlayRecording,
  commonsAudioUrl,
  isVietnameseVoice,
  pickVoice,
  playRecording,
  saveVoiceUri,
  savedVoiceUri,
  vietnameseVoices,
} from './audio';

const voice = (voiceURI: string, lang: string) => ({ voiceURI, lang });

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
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
    let interrupt = () => {};
    vi.stubGlobal(
      'Audio',
      class {
        src = '';
        pause() {
          interrupt();
        }
        play() {
          return new Promise<void>((resolve, reject) => {
            interrupt = () => reject(new DOMException('The play() request was interrupted', 'AbortError'));
            if (this.src.endsWith('missing.wav')) reject(new DOMException('No supported source', 'NotSupportedError'));
            if (this.src.endsWith('b.wav')) resolve();
          });
        }
      },
    );
    const first = playRecording('a.wav');
    await playRecording('b.wav');
    await expect(first).resolves.toBeUndefined();
    await expect(playRecording('missing.wav')).rejects.toThrow('No supported source');
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

  it('remembers the chosen voice on this device', () => {
    expect(savedVoiceUri()).toBeNull();
    saveVoiceUri('vi-2');
    expect(savedVoiceUri()).toBe('vi-2');
    saveVoiceUri(null);
    expect(savedVoiceUri()).toBeNull();
  });
});

describe('vietnameseVoices', () => {
  /** A speechSynthesis stand-in whose voice list the test fills in later, as browsers do. */
  function stubSpeech() {
    let list: ReturnType<typeof voice>[] = [];
    const synth = Object.assign(new EventTarget(), { getVoices: () => list, cancel: () => {} });
    vi.stubGlobal('speechSynthesis', synth);
    return {
      setVoices: (next: ReturnType<typeof voice>[]) => {
        list = next;
      },
      fireVoicesChanged: () => synth.dispatchEvent(new Event('voiceschanged')),
    };
  }

  it('updates on voiceschanged, and again later for browsers that never fire it', () => {
    vi.useFakeTimers();
    const speech = stubSpeech();
    const seen: string[][] = [];
    const stop = vietnameseVoices.subscribe((list) => seen.push(list.map((v) => v.voiceURI)));
    speech.setVoices([voice('en', 'en-US'), voice('vi-1', 'vi-VN')]);
    speech.fireVoicesChanged();
    expect(seen).toEqual([[], ['vi-1']]);
    speech.setVoices([voice('en', 'en-US'), voice('vi-1', 'vi-VN'), voice('vi-2', 'vi-VN')]);
    vi.advanceTimersByTime(3000);
    expect(seen.at(-1)).toEqual(['vi-1', 'vi-2']);
    stop();
  });

  it('stops listening and clears its retries when unsubscribed', () => {
    vi.useFakeTimers();
    const speech = stubSpeech();
    const seen: string[][] = [];
    const stop = vietnameseVoices.subscribe((list) => seen.push(list.map((v) => v.voiceURI)));
    stop();
    expect(vi.getTimerCount()).toBe(0);
    speech.setVoices([voice('vi-1', 'vi-VN')]);
    speech.fireVoicesChanged();
    expect(seen).toEqual([[]]);
  });
});
