/** Owns one microphone session; cancelled/error sessions never auto-submit. */
export function createJackSpeechInput({ Recognition, onText, onSubmit, onListening, onError }) {
  let current = null;
  function cancel() {
    const rec = current;
    current = null;
    if (!rec) return;
    rec.onresult = rec.onerror = rec.onend = null;
    try { rec.abort(); } catch { /* Already stopped. */ }
    onListening(false);
  }
  return {
    cancel,
    toggle() {
      if (current) { try { current.stop(); } catch { cancel(); } return; }
      const rec = new Recognition();
      current = rec;
      rec.lang = 'en-US';
      rec.interimResults = true;
      rec.maxAlternatives = 1;
      let finalText = '';
      rec.onresult = (event) => {
        if (current !== rec) return;
        const final = []; const interim = [];
        for (const result of Array.from(event.results)) (result.isFinal ? final : interim).push(result[0].transcript.trim());
        finalText = final.join(' ');
        onText([...final, ...interim].join(' '));
      };
      rec.onerror = (event) => {
        if (current !== rec) return;
        cancel();
        if (!['aborted', 'no-speech'].includes(event.error)) onError(event.error);
      };
      rec.onend = () => {
        if (current !== rec) return;
        current = null;
        rec.onresult = rec.onerror = rec.onend = null;
        onListening(false);
        if (finalText.trim()) onSubmit(finalText.trim());
      };
      onListening(true);
      try { rec.start(); } catch { cancel(); onError('start-failed'); }
    },
  };
}
