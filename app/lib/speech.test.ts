import { describe, expect, it } from 'vitest';
import { configureAmericanUtterance, selectAmericanVoice } from './speech';

function voice(
  name: string,
  lang: string,
  options: Partial<Pick<SpeechSynthesisVoice, 'default' | 'localService'>> = {},
) {
  return {
    name,
    lang,
    default: options.default ?? false,
    localService: options.localService ?? false,
    voiceURI: name,
  } as SpeechSynthesisVoice;
}

describe('American English speech configuration', () => {
  it('prefers a local default en-US voice and accepts underscore locale spelling', () => {
    const remoteDefault = voice('Remote', 'en-US', { default: true });
    const local = voice('Local', 'en_US', { localService: true });
    const localDefault = voice('Local default', 'en-US', { localService: true, default: true });
    expect(selectAmericanVoice([remoteDefault, local, localDefault])).toBe(localDefault);
  });

  it('does not substitute a non-American voice', () => {
    expect(selectAmericanVoice([voice('British', 'en-GB', { localService: true })])).toBeNull();
  });

  it('sets the approved language, rate, pitch, volume, and voice', () => {
    const american = voice('American', 'en-US', { localService: true });
    const utterance = { lang: '', rate: 1, pitch: 0, volume: 0, voice: null } as SpeechSynthesisUtterance;
    expect(configureAmericanUtterance(utterance, [american])).toBe(utterance);
    expect(utterance).toMatchObject({
      lang: 'en-US',
      rate: 0.9,
      pitch: 1,
      volume: 1,
      voice: american,
    });
  });
});
