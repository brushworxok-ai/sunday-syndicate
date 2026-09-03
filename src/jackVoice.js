const MALE_NAMES = ['Microsoft David', 'Microsoft Guy', 'Microsoft Mark', 'Microsoft Christopher', 'Microsoft Eric', 'Aaron', 'Alex', 'Tom', 'Fred', 'Google US English Male', 'Daniel', 'Arthur', 'Google UK English Male', 'Rishi', 'Gordon', 'Reed', 'Rocko', 'Eddy', 'Microsoft Ryan', 'Lee', 'Oliver'];

export function pickMaleVoice(voices = []) {
  const english = voices.filter((voice) => /^en(?:[-_]|$)/i.test(voice.lang));
  for (const name of MALE_NAMES) {
    const match = english.find((voice) => voice.name.toLowerCase().startsWith(name.toLowerCase()));
    if (match) return match;
  }
  return english.find((voice) => /\bmale\b/i.test(voice.name) && !/female/i.test(voice.name)) ?? null;
}

async function loadedVoices(speech, signal) {
  if (speech.getVoices().length) return speech.getVoices();
  await new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      speech.removeEventListener?.('voiceschanged', finish);
      signal.removeEventListener('abort', finish);
      resolve();
    };
    const timer = setTimeout(finish, 700);
    speech.addEventListener?.('voiceschanged', finish, { once: true });
    signal.addEventListener('abort', finish, { once: true });
  });
  return speech.getVoices();
}

// Own one voice request/playback at a time. A late response cannot restart Jack
// after Stop, logout, closing the drawer, or another message taking over.
export function createJackVoicePlayback({ fetchImpl = fetch, AudioClass = Audio, speech = window.speechSynthesis, UtteranceClass = window.SpeechSynthesisUtterance, urls = URL, onState = () => {}, onAudio = () => {}, onBrowser = () => {}, onStop = () => {} } = {}) {
  let active = null;
  function releaseAudio(task) {
    if (task.audio) {
      task.audio.onended = null;
      task.audio.onerror = null;
      task.audio.pause();
      task.audio.removeAttribute?.('src');
      task.audio.load?.();
      task.audio = null;
    }
    if (task.url) { urls.revokeObjectURL(task.url); task.url = null; }
  }
  function stop() {
    const previous = active;
    active = null;
    if (previous) {
      previous.controller.abort();
      clearTimeout(previous.timer);
      releaseAudio(previous);
      if (previous.utterance) { previous.utterance.onend = null; previous.utterance.onerror = null; }
    }
    speech?.cancel();
    onStop();
    onState({ phase: 'idle' });
  }
  async function fallback(task, reason) {
    if (active !== task || task.fallingBack) return;
    task.fallingBack = true;
    releaseAudio(task);
    onStop();
    if (!speech || !UtteranceClass) {
      active = null;
      onState({ phase: 'error', message: `${reason} Text is still available.` });
      return;
    }
    const voice = pickMaleVoice(await loadedVoices(speech, task.controller.signal));
    if (active !== task) return;
    if (!voice) {
      active = null;
      onState({ phase: 'error', message: `${reason} No compatible Jack fallback voice is installed on this device.` });
      return;
    }
    const utterance = new UtteranceClass(task.text);
    task.utterance = utterance;
    utterance.voice = voice;
    utterance.lang = voice.lang;
    utterance.rate = 0.95;
    utterance.pitch = 0.7;
    utterance.onend = () => { if (active === task) stop(); };
    utterance.onerror = () => {
      if (active !== task) return;
      stop();
      onState({ phase: 'error', message: 'Voice playback was blocked. Tap Listen again, or continue reading Jack’s reply.' });
    };
    onState({ phase: 'playing', provider: 'browser', message: `${reason} Using device voice: ${voice.name}.` });
    onBrowser(task.text);
    speech.speak(utterance);
  }
  async function play(text) {
    if (!String(text ?? '').trim()) return;
    stop();
    const task = { text: String(text).slice(0, 1200), controller: new AbortController() };
    active = task;
    onState({ phase: 'loading', message: 'Loading Jack’s studio voice…' });
    task.timer = setTimeout(() => task.controller.abort(), 15_000);
    try {
      const response = await fetchImpl('/api/tts', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: task.text }), signal: task.controller.signal,
      });
      if (active !== task) return;
      if (response.status === 401 || response.status === 403) {
        stop();
        onState({ phase: 'error', message: 'Sign in to hear Jack’s voice.' });
        return;
      }
      if (!response.ok || !response.headers.get('content-type')?.startsWith('audio/')) throw new Error('Studio voice unavailable');
      const blob = await response.blob();
      if (active !== task) return;
      if (!blob.size) throw new Error('Empty audio');
      task.url = urls.createObjectURL(blob);
      task.audio = new AudioClass(task.url);
      task.audio.onended = () => { if (active === task) stop(); };
      task.audio.onerror = () => { if (active === task) void fallback(task, 'Jack’s studio audio could not play.'); };
      await task.audio.play();
      if (active === task) {
        onAudio(task.audio, task.text);
        onState({ phase: 'playing', provider: 'elevenlabs', message: 'Jack’s studio voice · ElevenLabs' });
      }
    } catch (error) {
      if (active === task) {
        if (error.name === 'NotAllowedError' && task.audio) {
          onStop();
          onState({ phase: 'blocked', message: 'Jack’s studio voice is ready. Tap Play studio voice to allow audio on this device.' });
          return;
        }
        // A request timeout is recoverable; manual cancellation is not.
        task.controller = new AbortController();
        await fallback(task, 'Jack’s studio voice is unavailable.');
      }
    } finally { clearTimeout(task.timer); }
  }
  async function resume() {
    const task = active;
    if (!task?.audio) return;
    try {
      await task.audio.play();
      if (active !== task) return;
      onAudio(task.audio, task.text);
      onState({ phase: 'playing', provider: 'elevenlabs', message: 'Jack’s studio voice · ElevenLabs' });
    } catch {
      if (active === task) onState({ phase: 'blocked', message: 'Audio is still blocked. Check this site’s sound permissions, then tap Play studio voice again.' });
    }
  }
  return { play, stop, resume };
}
