/** Durable claim prevents a retry/double-click from sending a second test. */
export async function sendCommissionerSmsTest({ store, leagueId, provider, destination, requestId }) {
  const key = `commissioner-sms-test:${requestId}`;
  if (!await store.claimOnce(leagueId, key)) {
    const saved = await store.getConfig(key);
    return saved ? JSON.parse(saved) : { accepted: false, status: 'unknown', note: 'This test was already attempted. Do not resend while its delivery is uncertain.' };
  }
  let result;
  try {
    const sent = await provider.send({ player: { id: 'diag', phoneE164: destination }, text: '405 BadGuys Parlay: Jack SMS test. This is a single test requested by the commissioner.' });
    result = { accepted: true, ...sent, note: 'Accepted is not delivered. Check delivery status and confirm receipt on the phone.' };
  } catch (error) {
    result = { accepted: false, status: 'unknown', error: error.message, note: 'No automatic retry was made. Check the provider logs before sending another test.' };
  }
  await store.setConfig(key, JSON.stringify(result));
  return result;
}
