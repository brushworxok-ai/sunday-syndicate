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

test('Jack uses the configured voice ID and preserves saved voice settings by default', async () => {
  let payload, target;
  const provider = createJackTtsProvider({ JACK_TTS_PROVIDER: ' elevenlabs ', JACK_TTS_API_KEY: ' key ', JACK_TTS_VOICE_ID: ' jack-original ' }, async (url, options) => {
    target = url;
    payload = JSON.parse(options.body);
    return new Response(new Uint8Array([1]), { headers: { 'content-type': 'audio/mpeg' } });
  });
  await provider.synthesize({ text: 'Jack here.' });
  assert.match(target, /\/jack-original\?/);
  assert.equal(payload.voice_settings, undefined);
});

test('Jack refuses non-audio and empty provider responses', async () => {
  const env = { JACK_TTS_PROVIDER: 'elevenlabs', JACK_TTS_API_KEY: 'key', JACK_TTS_VOICE_ID: 'voice' };
  await assert.rejects(createJackTtsProvider(env, async () => Response.json({ error: 'bad' })).synthesize({ text: 'hello' }), /non-audio/);
  await assert.rejects(createJackTtsProvider(env, async () => new Response('', { headers: { 'content-type': 'audio/mpeg' } })).synthesize({ text: 'hello' }), /empty audio/);
});

test('Read-only voice diagnostics identify the voice without generating billable speech', async () => {
  const calls = [];
  const provider = createJackTtsProvider({ JACK_TTS_PROVIDER: 'elevenlabs', JACK_TTS_API_KEY: 'key', JACK_TTS_VOICE_ID: 'voice' }, async (url) => {
    calls.push(url);
    return Response.json(url.includes('/voices/') ? { name: 'Original Jack', category: 'generated', labels: { gender: 'male' } } : { tier: 'test', character_count: 0, character_limit: 100 });
  });
  const report = await provider.diagnose();
  assert.equal(report.voiceLookup.name, 'Original Jack');
  assert.equal(report.testSynthesis, undefined);
  assert.equal(calls.some((url) => url.includes('text-to-speech')), false);
});
