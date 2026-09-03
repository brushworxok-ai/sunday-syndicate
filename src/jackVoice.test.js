import test from 'node:test';
import assert from 'node:assert/strict';
import { createJackVoicePlayback, pickMaleVoice } from './jackVoice.js';

const audioResponse = () => new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'audio/mpeg' } });
function harness(fetchImpl, voices = [{ name: 'Microsoft David', lang: 'en-US' }]) {
  const state = { states: [], audios: [], spoken: [], revoked: [] };
  class FakeAudio {
    constructor() { state.audios.push(this); }
    async play() { this.played = true; }
    pause() { this.paused = true; }
  }
  const playback = createJackVoicePlayback({ fetchImpl, AudioClass: FakeAudio,
    speech: { getVoices: () => voices, speak: (utterance) => state.spoken.push(utterance), cancel() {} },
    UtteranceClass: class { constructor(text) { this.text = text; } },
    urls: { createObjectURL: () => 'blob:test', revokeObjectURL: (url) => state.revoked.push(url) },
    onState: (value) => state.states.push(value),
  });
  return { ...state, playback };
}

test('Jack plays the server voice and releases its object URL when stopped', async () => {
  const h = harness(async () => audioResponse());
  await h.playback.play('Jack here.');
  assert.equal(h.audios[0].played, true);
  assert.equal(h.states.at(-1).provider, 'elevenlabs');
  assert.equal(h.spoken.length, 0);
  h.playback.stop();
  assert.deepEqual(h.revoked, ['blob:test']);
  assert.equal(h.audios[0].paused, true);
});

test('Stop cancels pending TTS and ignores late responses without speaking', async () => {
  let resolve, signal;
  const h = harness((_url, options) => { signal = options.signal; return new Promise((r) => { resolve = r; }); });
  const pending = h.playback.play('This must not play after close.');
  h.playback.stop();
  assert.equal(signal.aborted, true);
  resolve(audioResponse());
  await pending;
  assert.equal(h.audios.length, 0);
  assert.equal(h.spoken.length, 0);
});

test('Failed studio voice identifies the actual device fallback by name', async () => {
  const h = harness(async () => new Response('{}', { status: 502 }));
  await h.playback.play('Fallback test');
  assert.equal(h.spoken[0].voice.name, 'Microsoft David');
  assert.equal(h.states.at(-1).provider, 'browser');
  assert.match(h.states.at(-1).message, /device voice: Microsoft David/);
  h.playback.stop();
});

test('A missing Jack-compatible voice does not silently use the device default', async () => {
  const h = harness(async () => new Response('{}', { status: 503 }), [{ name: 'Samantha', lang: 'en-US' }]);
  await h.playback.play('Read this instead.');
  assert.equal(h.spoken.length, 0);
  assert.equal(h.states.at(-1).phase, 'error');
  assert.equal(pickMaleVoice([{ name: 'Google UK English Female', lang: 'en-GB' }]), null);
});

test('An expired player session never bypasses the voice login requirement via fallback', async () => {
  const h = harness(async () => new Response('{}', { status: 401 }));
  await h.playback.play('Private answer');
  assert.equal(h.spoken.length, 0);
  assert.match(h.states.at(-1).message, /Sign in/);
});

test('Autoplay blocking offers the same studio audio on the next tap without regenerating it', async () => {
  let requests = 0, plays = 0;
  const states = [];
  const playback = createJackVoicePlayback({
    fetchImpl: async () => { requests++; return audioResponse(); },
    AudioClass: class { async play() { if (++plays === 1) throw new DOMException('Tap required', 'NotAllowedError'); } pause() {} },
    speech: { cancel() {}, getVoices: () => [], speak: () => assert.fail('must preserve the studio voice') },
    UtteranceClass: class {}, urls: { createObjectURL: () => 'blob:test', revokeObjectURL() {} }, onState: (state) => states.push(state),
  });
  await playback.play('Jack here');
  assert.equal(states.at(-1).phase, 'blocked');
  await playback.resume();
  assert.equal(states.at(-1).provider, 'elevenlabs');
  assert.equal(requests, 1);
  playback.stop();
});
