export type PronunciationStatus = 'idle' | 'speaking' | 'unsupported' | 'error';

function normalizeLanguage(language: string) {
  return language.trim().replace('_', '-').toLowerCase();
}

export function selectAmericanVoice(voices: SpeechSynthesisVoice[]) {
  const americanVoices = voices.filter((voice) => normalizeLanguage(voice.lang) === 'en-us');
  return (
    americanVoices.find((voice) => voice.localService && voice.default) ??
    americanVoices.find((voice) => voice.localService) ??
    americanVoices.find((voice) => voice.default) ??
    americanVoices[0] ??
    null
  );
}

export function configureAmericanUtterance(
  utterance: SpeechSynthesisUtterance,
  voices: SpeechSynthesisVoice[],
) {
  utterance.lang = 'en-US';
  utterance.rate = 0.9;
  utterance.pitch = 1;
  utterance.volume = 1;
  const voice = selectAmericanVoice(voices);
  if (voice) utterance.voice = voice;
  return utterance;
}
