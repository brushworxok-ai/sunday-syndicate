import test from 'node:test';
import assert from 'node:assert/strict';
import { createJackSpeechInput } from './jackSpeechInput.js';

function fixture() {
  const instances = []; const submissions = []; const text = []; const errors = []; const listening = [];
  class Recognition {
    constructor() { instances.push(this); }
    start() {}
    stop() { this.onend?.(); }
    abort() { this.aborted = true; this.onend?.(); }
  }
  const controller = createJackSpeechInput({ Recognition, onSubmit: (value) => submissions.push(value), onText: (value) => text.push(value), onError: (value) => errors.push(value), onListening: (value) => listening.push(value) });
  const result = (value, isFinal = true) => Object.assign([{ transcript: value }], { isFinal });
  return { controller, instances, submissions, text, errors, listening, result };
}

test('Jack microphone submits one final transcript with correct word spacing', () => {
  const f = fixture(); f.controller.toggle();
  f.instances[0].onresult({ results: [f.result('Hello'), f.result('Jack')] });
  f.controller.toggle();
  assert.deepEqual(f.submissions, ['Hello Jack']);
  assert.deepEqual(f.listening, [true, false]);
  assert.equal(f.instances.length, 1);
});

test('Closing Jack or signing out aborts capture and ignores late result/end callbacks', () => {
  const f = fixture(); f.controller.toggle();
  const rec = f.instances[0];
  const lateEnd = rec.onend; const lateResult = rec.onresult;
  rec.onresult({ results: [f.result('private question')] });
  f.controller.cancel();
  lateResult({ results: [f.result('late question')] }); lateEnd();
  assert.equal(rec.aborted, true);
  assert.deepEqual(f.submissions, []);
  assert.deepEqual(f.text, ['private question']);
});

test('Microphone error never submits a partial transcript and can be retried', () => {
  const f = fixture(); f.controller.toggle();
  const rec = f.instances[0]; const lateEnd = rec.onend;
  rec.onresult({ results: [f.result('partial question')] });
  rec.onerror({ error: 'not-allowed' }); lateEnd();
  assert.deepEqual(f.submissions, []);
  assert.deepEqual(f.errors, ['not-allowed']);
  f.controller.toggle();
  assert.equal(f.instances.length, 2);
});
