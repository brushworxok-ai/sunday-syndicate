export const SMS_CONSENT_VERSION = '2026-09-04';

export const SMS_PROGRAM_NAME = '405 BadGuys Parlay';

export const SMS_DISCLOSURE = 'I agree to receive recurring automated texts from 405 BadGuys Parlay for verification, pick reminders, results, and league announcements. Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for help. Consent is not required to join.';

const SMS_FOOTER = 'Reply STOP to opt out; HELP for help.';

export function hasCurrentSmsConsent(player) {
  return Boolean(
    player?.phoneVerifiedAt
    && player?.messaging?.smsConsent === 'opted_in'
    && player?.messaging?.consentVersion === SMS_CONSENT_VERSION,
  );
}

export function compliantSmsText(value, maxLength = 480) {
  let text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!/405\s+BadGuys/i.test(text.slice(0, 48))) text = `${SMS_PROGRAM_NAME}: ${text}`;
  if (!/reply\s+stop/i.test(text)) text = `${text} ${SMS_FOOTER}`;
  if (text.length <= maxLength) return text;
  const footer = ` ${SMS_FOOTER}`;
  const bodyLimit = Math.max(0, maxLength - footer.length - 1);
  return `${text.slice(0, bodyLimit).trimEnd()}…${footer}`;
}
