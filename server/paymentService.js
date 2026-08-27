import { randomBytes, randomUUID } from 'node:crypto';
import Stripe from 'stripe';

export const FUNDING_AMOUNTS_CENTS = [2000, 6000, 10000];

export class FundingError extends Error {
  constructor(message, status = 400, code = 'funding_error') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function validateAmount(amountCents) {
  const amount = Number(amountCents);
  if (!FUNDING_AMOUNTS_CENTS.includes(amount)) {
    throw new FundingError('Choose an approved funding amount: $20, $60, or $100.', 422, 'invalid_funding_amount');
  }
  return amount;
}

function integrationIdentifier() {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz';
  const suffix = Array.from(randomBytes(8), (byte) => alphabet[byte % alphabet.length]).join('');
  return `sunday_syndicate_${suffix}`;
}

export function createPaymentProvider(env = process.env) {
  const configured = env.PAYMENTS_PROVIDER === 'stripe' && Boolean(env.STRIPE_RESTRICTED_KEY);
  if (!configured) {
    return {
      kind: 'demo',
      configured: false,
      async createCheckout({ leagueId, playerId, amountCents }) {
        const amount = validateAmount(amountCents);
        return {
          id: `demo-funding-${randomUUID()}`,
          leagueId,
          playerId,
          amountCents: amount,
          currency: 'usd',
          provider: 'demo',
          status: 'pending',
          checkoutUrl: null,
          createdAt: new Date().toISOString(),
        };
      },
    };
  }

  const stripe = new Stripe(env.STRIPE_RESTRICTED_KEY, { apiVersion: '2026-06-24.dahlia' });
  return {
    kind: 'stripe',
    configured: true,
    stripe,
    async createCheckout({ leagueId, playerId, amountCents, baseUrl }) {
      const amount = validateAmount(amountCents);
      const localId = `funding-${randomUUID()}`;
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        integration_identifier: integrationIdentifier(),
        client_reference_id: playerId,
        success_url: `${baseUrl}/?funding=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/?funding=cancelled`,
        line_items: [{
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: amount,
            product_data: {
              name: '405 BADGUYS PARLAY weekly entry credits',
              description: 'Non-transferable credits used only for league entry fees; no cash value or withdrawal.',
            },
          },
        }],
        metadata: { localFundingId: localId, leagueId, playerId, amountCents: String(amount) },
      });
      return {
        id: localId,
        leagueId,
        playerId,
        amountCents: amount,
        currency: 'usd',
        provider: 'stripe',
        providerRef: session.id,
        status: 'pending',
        checkoutUrl: session.url,
        createdAt: new Date().toISOString(),
      };
    },
    constructWebhook(payload, signature, secret) {
      if (!secret) throw new FundingError('Stripe webhook secret is not configured.', 503, 'stripe_webhook_unconfigured');
      return stripe.webhooks.constructEvent(payload, signature, secret);
    },
  };
}

export function completedCheckoutFunding(event) {
  if (event?.type !== 'checkout.session.completed') return null;
  const session = event.data?.object;
  if (!session || session.payment_status !== 'paid') return null;
  return {
    providerRef: session.id,
    eventId: event.id,
    amountCents: Number(session.amount_total),
    leagueId: session.metadata?.leagueId,
    playerId: session.metadata?.playerId,
  };
}
