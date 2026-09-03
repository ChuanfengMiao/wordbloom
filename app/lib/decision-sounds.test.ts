import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDecisionSounds } from './decision-sounds';

function installAudio(state: AudioContextState = 'running') {
  const parameter = () => ({
    setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(), cancelScheduledValues: vi.fn(), setTargetAtTime: vi.fn(),
  });
  const oscillator = () => ({
    type: '', frequency: parameter(), connect: vi.fn(), disconnect: vi.fn(),
    start: vi.fn(), stop: vi.fn(), onended: null as (() => void) | null,
  });
  const gain = () => ({ gain: parameter(), connect: vi.fn(), disconnect: vi.fn() });
  const context = {
    state, currentTime: 4, destination: {},
    createOscillator: vi.fn(oscillator), createGain: vi.fn(gain),
    resume: vi.fn(async () => { context.state = 'running'; }),
    close: vi.fn(async () => { context.state = 'closed'; }),
  };
  const construct = vi.fn();
  vi.stubGlobal('AudioContext', class {
    constructor() { construct(); return context; }
  });
  return { context, construct };
}

afterEach(() => vi.unstubAllGlobals());

describe('decision sounds', () => {
  it('lazily creates one context and plays distinct short, quiet cues', async () => {
    const { context, construct } = installAudio();
    const sounds = createDecisionSounds();
    expect(construct).not.toHaveBeenCalled();
    await sounds.play(1);
    expect(construct).toHaveBeenCalledTimes(1);
    const known = context.createOscillator.mock.results.map(({ value }) => value);
    expect(known[0].frequency.setValueAtTime).toHaveBeenCalledWith(880, 4);
    expect(known[1].frequency.setValueAtTime).toHaveBeenCalledWith(1174.66, 4.055);
    expect(known[1].stop.mock.calls[0][0] - 4).toBeLessThan(0.2);
    expect(context.createGain.mock.results[0].value.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0.055, 4.004);

    await sounds.play(2);
    expect(construct).toHaveBeenCalledTimes(1);
    expect(known[0].stop).toHaveBeenLastCalledWith(4.025);
    const unknown = context.createOscillator.mock.results.slice(2).map(({ value }) => value);
    expect(unknown[0].frequency.setValueAtTime).toHaveBeenCalledWith(587.33, 4);
    expect(unknown[1].frequency.setValueAtTime).toHaveBeenCalledWith(440, 4.04);
    expect(unknown[1].stop.mock.calls[0][0] - 4).toBeLessThan(0.2);
    sounds.dispose();
  });

  it('resumes suspended audio and drops stale queued cues', async () => {
    const { context } = installAudio('suspended');
    let finishResume!: () => void;
    context.resume.mockImplementation(() => new Promise<void>((resolve) => {
      finishResume = () => { context.state = 'running'; resolve(); };
    }));
    const sounds = createDecisionSounds();
    const pending = sounds.play(1);
    expect(context.resume).toHaveBeenCalledOnce();
    sounds.stop();
    finishResume();
    await pending;
    expect(context.createOscillator).not.toHaveBeenCalled();
    await sounds.play(2);
    expect(context.createOscillator).toHaveBeenCalledTimes(2);
    sounds.dispose();
  });

  it('disconnects finished voices and closes on teardown without replaying', async () => {
    const { context } = installAudio();
    const sounds = createDecisionSounds();
    await sounds.play(1);
    const voice = context.createOscillator.mock.results[0].value;
    voice.onended?.();
    expect(voice.disconnect).toHaveBeenCalledOnce();
    expect(context.createGain.mock.results[0].value.disconnect).toHaveBeenCalledOnce();
    sounds.dispose();
    expect(context.close).toHaveBeenCalledOnce();
    await sounds.play(2);
    expect(context.createOscillator).toHaveBeenCalledTimes(2);
  });

  it('ignores unsupported, rejected, and failed audio without throwing', async () => {
    vi.stubGlobal('AudioContext', undefined);
    await expect(createDecisionSounds().play(1)).resolves.toBeUndefined();
    const { context } = installAudio('suspended');
    context.resume.mockRejectedValue(new Error('Blocked'));
    const sounds = createDecisionSounds();
    await expect(sounds.play(1)).resolves.toBeUndefined();
    expect(context.createOscillator).not.toHaveBeenCalled();
    context.state = 'running';
    context.createOscillator.mockImplementation(() => { throw new Error('Unavailable'); });
    await expect(sounds.play(2)).resolves.toBeUndefined();
    sounds.dispose();
  });
});
