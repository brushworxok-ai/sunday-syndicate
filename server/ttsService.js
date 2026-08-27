const ELEVENLABS_BASE = 'https://api.elevenlabs.io/v1/text-to-speech';

export function createJackTtsProvider(env = process.env, fetchImpl = fetch) {
  const kind = String(env.JACK_TTS_PROVIDER ?? 'browser').toLowerCase();
  if (kind !== 'elevenlabs') return {
    kind: 'browser',
    configured: false,
    profile: 'deep-warm-original',
    async synthesize() { throw new Error('Server voice is not configured. Use the browser voice fallback.'); },
  };

  const apiKey = String(env.JACK_TTS_API_KEY ?? '');
  const voiceId = String(env.JACK_TTS_VOICE_ID ?? '');
  const configured = Boolean(apiKey && voiceId);
  return {
    kind,
    configured,
    profile: 'deep-warm-original-designed-voice',
    async synthesize({ text, speed = 0.94 } = {}) {
      const safeText = normalizeSpeechText(text);
      if (!configured) throw new Error('Jack voice provider credentials are incomplete.');
      const response = await fetchImpl(`${ELEVENLABS_BASE}/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'audio/mpeg', 'xi-api-key': apiKey },
        body: JSON.stringify({
          text: safeText,
          model_id: env.JACK_TTS_MODEL || 'eleven_flash_v2_5',
          voice_settings: {
            stability: 0.56,
            similarity_boost: 0.18,
            style: 0.54,
            speed: Math.min(1.2, Math.max(0.8, Number(speed) || 0.94)),
            use_speaker_boost: false,
          },
        }),
        signal: AbortSignal.timeout(12_000),
      });
      if (!response.ok) throw new Error(`Voice provider request failed (${response.status}).`);
      return { contentType: response.headers.get('content-type') || 'audio/mpeg', bytes: Buffer.from(await response.arrayBuffer()) };
    },
  };
}

export function normalizeSpeechText(value) {
  const text = String(value ?? '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim();
  if (!text) throw new Error('Speech text is required.');
  if (text.length > 1200) throw new Error('Speech text must be 1,200 characters or fewer.');
  return text;
}
