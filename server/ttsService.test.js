import test from 'node:test';
import assert from 'node:assert/strict';
import { createJackTtsProvider, normalizeSpeechText } from './ttsService.js';

test('Jack TTS defaults to a safe browser fallback without credentials', async () => {
  const provider = createJackTtsProvider({});
  assert.equal(provider.kind, 'browser');
  assert.equal(provider.configured, false);
  await assert.rejects(provider.synthesize({ text: 'Hello' }), /browser voice fallback/);
});

test('Jack TTS keeps provider credentials server-side and bounds the script', async () => {
  let request;
  const provider = createJackTtsProvider({
    JACK_TTS_PROVIDER: 'elevenlabs',
    JACK_TTS_API_KEY: 'server-secret',
    JACK_TTS_VOICE_ID: 'designed-jack-voice',
  }, async (url, options) => {
    request = { url, options };
    return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'audio/mpeg' } });
  });
  const audio = await provider.synthesize({ text: '  Winner <script> alert.  ', speed: 0.92 });
  assert.equal(provider.configured, true);
  assert.equal(audio.contentType, 'audio/mpeg');
  assert.match(request.url, /designed-jack-voice/);
  assert.equal(request.options.headers['xi-api-key'], 'server-secret');
  assert.equal(JSON.parse(request.options.body).text, 'Winner script alert.');
  assert.throws(() => normalizeSpeechText('x'.repeat(1201)), /1,200/);
});
