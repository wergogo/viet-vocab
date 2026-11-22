import { beforeEach, describe, expect, it } from 'vitest';
import { commonsAudioUrl, isVietnameseVoice, pickVoice, saveVoiceUri, savedVoiceUri } from './audio';

const voice = (voiceURI: string, lang: string) => ({ voiceURI, lang });

beforeEach(() => {
  localStorage.clear();
});

describe('commonsAudioUrl', () => {
  it('points at Special:FilePath with underscores, percent-encoded', () => {
    expect(commonsAudioUrl('LL-Q9199 (vie)-Penn Zero MSSJ-thành phố.wav')).toBe(
      'https://commons.wikimedia.org/wiki/Special:FilePath/LL-Q9199_(vie)-Penn_Zero_MSSJ-th%C3%A0nh_ph%E1%BB%91.wav',
    );
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
