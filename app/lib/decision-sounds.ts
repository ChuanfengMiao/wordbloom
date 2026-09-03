type Decision = 1 | 2;
type Tone = { frequency: number; delay: number; duration: number };

// Two soft, consonant plucks: a bright rising cue and a warmer settling cue.
const CUES: Record<Decision, Tone[]> = {
  1: [{ frequency: 880, delay: 0, duration: 0.09 }, { frequency: 1174.66, delay: 0.055, duration: 0.115 }],
  2: [{ frequency: 587.33, delay: 0, duration: 0.08 }, { frequency: 440, delay: 0.04, duration: 0.11 }],
};

export function createDecisionSounds() {
  let context: AudioContext | null = null;
  let generation = 0;
  let disposed = false;
  const active = new Set<{ oscillator: OscillatorNode; gain: GainNode }>();

  const stop = () => {
    generation += 1;
    for (const voice of active) {
      try {
        const now = context?.currentTime ?? 0;
        voice.gain.gain.cancelScheduledValues(now);
        voice.gain.gain.setTargetAtTime(0, now, 0.006);
        voice.oscillator.stop(now + 0.025);
      } catch {
        // An already-ended node needs only the normal disconnect cleanup.
      }
    }
  };

  const play = async (decision: Decision) => {
    stop();
    const request = generation;
    try {
      if (disposed || typeof window === 'undefined') return;
      const AudioContextClass = window.AudioContext ??
        (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;
      context ??= new AudioContextClass();
      // Called directly from the accepted gesture so browser audio can unlock.
      if (context.state === 'suspended') await context.resume();
      if (disposed || request !== generation || context.state !== 'running') return;
      const now = context.currentTime;
      for (const tone of CUES[decision]) {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const voice = { oscillator, gain };
        active.add(voice);
        oscillator.onended = () => {
          oscillator.disconnect();
          gain.disconnect();
          active.delete(voice);
        };
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(tone.frequency, now + tone.delay);
        gain.gain.setValueAtTime(0, now);
        gain.gain.setValueAtTime(0, now + tone.delay);
        gain.gain.linearRampToValueAtTime(0.055, now + tone.delay + 0.004);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + tone.delay + tone.duration);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(now + tone.delay);
        oscillator.stop(now + tone.delay + tone.duration + 0.01);
      }
    } catch {
      // Audio is optional feedback; unavailable or blocked audio never stops classification.
      stop();
    }
  };

  const dispose = () => {
    disposed = true;
    stop();
    for (const { oscillator, gain } of active) {
      oscillator.disconnect();
      gain.disconnect();
    }
    active.clear();
    if (context && context.state !== 'closed') void context.close().catch(() => undefined);
    context = null;
  };

  return { play, stop, dispose };
}
