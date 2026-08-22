import { randomUUID } from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { DEMO_CHAT, DEMO_LEAGUE } from '../src/demoLeague.js';
import { hashPin } from './auth.js';

const clone = (value) => value == null ? value : structuredClone(value);
const byNewest = (field) => (left, right) => String(right?.[field] ?? '').localeCompare(String(left?.[field] ?? ''));

function auditEntry(event, detail, actor = 'system', metadata = {}, at = new Date().toISOString()) {
  return { id: randomUUID(), at, event, detail, actor, metadata };
}

function createDemoState() {
  const now = '2025-11-18T18:00:00.000Z';
  const finalizedAt = DEMO_LEAGUE.recap.factsSnapshot.resultsFinalizedAt;
  const players = DEMO_LEAGUE.players.map((player) => ({ ...clone(player), leagueId: DEMO_LEAGUE.id, phoneE164: null }));
  const playerCredentials = Object.fromEntries(players.map((player) => {
    const demoPin = player.phone.replace(/\D/g, '').slice(-4).padStart(4, '0');
    return [player.id, { playerId: player.id, pinHash: hashPin(demoPin), updatedAt: now }];
  }));
  const consentRecords = players.flatMap((player) => [
    {
      id: `consent-${player.id}-sms`, playerId: player.id, channel: 'sms_results',
      status: player.messaging.smsConsent, source: player.messaging.optedOutAt ? 'sms_stop' : 'player_settings',
      recordedAt: player.messaging.optedOutAt ?? player.messaging.consentedAt,
    },
    {
      id: `consent-${player.id}-roast`, playerId: player.id, channel: 'trash_talk',
      status: player.trashTalk.level, source: 'player_settings', recordedAt: player.trashTalk.updatedAt,
    },
  ]);
  const results = Object.fromEntries(Object.entries(DEMO_LEAGUE.results).map(([gameId, result]) => [gameId, {
    ...clone(result), verifiedAt: finalizedAt, verifiedBy: 'Commissioner Demo',
  }]));
  const chat = DEMO_CHAT.map((message) => ({
    ...clone(message),
    playerId: players.find((player) => player.name === message.name)?.id ?? null,
  }));
  const auditLog = DEMO_LEAGUE.auditLog.map((entry) => auditEntry(entry.event, entry.detail, 'system', {}, entry.at));

  return {
    id: DEMO_LEAGUE.id,
    name: DEMO_LEAGUE.name,
    week: DEMO_LEAGUE.week,
    settings: clone(DEMO_LEAGUE.settings),
    createdAt: now,
    players,
    playerCredentials,
    consentRecords,
    sheets: clone(DEMO_LEAGUE.sheets),
    results,
    recaps: [clone(DEMO_LEAGUE.recap)],
    sideBets: clone(DEMO_LEAGUE.sideBets),
    broadcasts: [clone(DEMO_LEAGUE.broadcast)],
    chat,
    auditLog,
    survivorPicks: [],
    payouts: [],
  };
}

function publicPlayer(player) {
  return {
    id: player.id,
    name: player.name,
    previousRank: player.previousRank,
    phone: player.phone,
    phoneVerifiedAt: player.phoneVerifiedAt,
    messaging: clone(player.messaging),
    trashTalk: clone(player.trashTalk),
  };
}

function authenticatedPlayer(player) {
  return {
    id: player.id,
    leagueId: player.leagueId,
    name: player.name,
    phone: player.phone,
    phoneE164: player.phoneE164,
    phoneVerifiedAt: player.phoneVerifiedAt,
    messaging: clone(player.messaging),
    trashTalk: clone(player.trashTalk),
  };
}

function publicLeague(state) {
  const recaps = clone(state.recaps ?? []).sort(byNewest('generatedAt'));
  const sideBets = clone(state.sideBets ?? []).sort(byNewest('createdAt'));
  const broadcasts = clone(state.broadcasts ?? []).sort(byNewest('sentAt'));
  return {
    id: state.id,
    name: state.name,
    week: state.week,
    settings: clone(state.settings),
    players: (state.players ?? []).map(publicPlayer).sort((a, b) => a.name.localeCompare(b.name)),
    sheets: clone(state.sheets ?? []).sort((a, b) => String(a.submittedAt).localeCompare(String(b.submittedAt))),
    results: clone(state.results ?? {}),
    recaps,
    latestRecap: recaps[0] ?? null,
    sideBets,
    broadcasts,
    latestBroadcast: broadcasts[0] ?? null,
    chat: clone(state.chat ?? []).sort((a, b) => String(a.time).localeCompare(String(b.time))),
    auditLog: clone(state.auditLog ?? []).sort(byNewest('at')).slice(0, 100),
    consentRecords: clone(state.consentRecords ?? []).sort(byNewest('recordedAt')),
    survivorPicks: clone(state.survivorPicks ?? []).sort((a, b) => Number(a.week) - Number(b.week)),
    payouts: clone(state.payouts ?? []).sort(byNewest('paidAt')),
  };
}

export class PostgresLeagueStore {
  constructor(databaseUrl) {
    if (!databaseUrl) throw new Error('DATABASE_URL is required for Postgres storage.');
    this.kind = 'postgres';
    this.sql = neon(databaseUrl);
  }

  async migrate() {
    await this.sql`
      CREATE TABLE IF NOT EXISTS league_states (
        league_id TEXT PRIMARY KEY,
        data JSONB NOT NULL,
        version BIGINT NOT NULL DEFAULT 1,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    await this.sql`CREATE INDEX IF NOT EXISTS idx_league_states_updated_at ON league_states(updated_at DESC)`;
  }

  async seedDemo({ force = false } = {}) {
    const serialized = JSON.stringify(createDemoState());
    if (force) {
      await this.sql`
        INSERT INTO league_states (league_id, data) VALUES (${DEMO_LEAGUE.id}, ${serialized}::jsonb)
        ON CONFLICT (league_id) DO UPDATE SET data = EXCLUDED.data, version = league_states.version + 1, updated_at = NOW()
      `;
      return true;
    }
    const inserted = await this.sql`
      INSERT INTO league_states (league_id, data) VALUES (${DEMO_LEAGUE.id}, ${serialized}::jsonb)
      ON CONFLICT (league_id) DO NOTHING
      RETURNING league_id
    `;
    return inserted.length > 0;
  }

  async readState(leagueId) {
    const rows = await this.sql`SELECT data FROM league_states WHERE league_id = ${leagueId}`;
    return rows[0]?.data ? clone(rows[0].data) : null;
  }

  async readAllStates() {
    const rows = await this.sql`SELECT data FROM league_states ORDER BY created_at`;
    return rows.map((row) => clone(row.data));
  }

  async mutateLeague(leagueId, mutator) {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const rows = await this.sql`SELECT data, version FROM league_states WHERE league_id = ${leagueId}`;
      if (!rows[0]) return null;
      const state = clone(rows[0].data);
      const outcome = await mutator(state);
      const serialized = JSON.stringify(state);
      const updated = await this.sql`
        UPDATE league_states
        SET data = ${serialized}::jsonb, version = version + 1, updated_at = NOW()
        WHERE league_id = ${leagueId} AND version = ${rows[0].version}
        RETURNING version
      `;
      if (updated.length === 1) return clone(outcome);
    }
    throw new Error(`Concurrent updates prevented saving league ${leagueId}.`);
  }

  async findStateContaining(collection, id) {
    const states = await this.readAllStates();
    return states.find((state) => (state[collection] ?? []).some((item) => item.id === id)) ?? null;
  }

  async getLeague(leagueId) {
    const state = await this.readState(leagueId);
    return state ? publicLeague(state) : null;
  }

  async getPlayer(playerId) {
    const state = await this.findStateContaining('players', playerId);
    const player = state?.players.find((item) => item.id === playerId);
    return player ? authenticatedPlayer(player) : null;
  }

  async getPlayerCredential(playerId) {
    const states = await this.readAllStates();
    const credential = states.map((state) => state.playerCredentials?.[playerId]).find(Boolean);
    return credential ? clone(credential) : null;
  }

  async findPlayerByPhoneE164(phoneE164) {
    const states = await this.readAllStates();
    for (const state of states) {
      const player = state.players.find((item) => item.phoneE164 === phoneE164);
      if (player) return authenticatedPlayer(player);
    }
    return null;
  }

  async updatePlayerPreferences(playerId, preferences, actor = 'player') {
    const state = await this.findStateContaining('players', playerId);
    if (!state) return null;
    return this.mutateLeague(state.id, (draft) => {
      const player = draft.players.find((item) => item.id === playerId);
      if (!player) return null;
      const at = new Date().toISOString();
      if (preferences.smsConsent) {
        player.messaging.smsConsent = preferences.smsConsent;
        if (preferences.smsConsent === 'opted_in') {
          player.messaging.consentedAt = at;
          delete player.messaging.optedOutAt;
        } else player.messaging.optedOutAt = at;
        draft.consentRecords.push({ id: randomUUID(), playerId, channel: 'sms_results', status: preferences.smsConsent, source: actor === 'twilio_webhook' ? 'sms_keyword' : 'player_settings', recordedAt: at });
      }
      if (preferences.resultsChannel) player.messaging.resultsChannel = preferences.resultsChannel;
      if (preferences.trashTalkLevel) {
        player.trashTalk.level = preferences.trashTalkLevel;
        player.trashTalk.updatedAt = at;
        draft.consentRecords.push({ id: randomUUID(), playerId, channel: 'trash_talk', status: preferences.trashTalkLevel, source: 'player_settings', recordedAt: at });
      }
      draft.auditLog.push(auditEntry('player.preferences_updated', `${player.name} updated communication preferences`, actor, { playerId, changes: preferences }, at));
      return authenticatedPlayer(player);
    });
  }

  async updateLeagueSettings(leagueId, settings) {
    return this.mutateLeague(leagueId, (draft) => {
      draft.settings = clone(settings);
      draft.auditLog.push(auditEntry('league.settings_updated', 'League settings updated', 'admin', { keys: Object.keys(settings) }));
    });
  }

  async createSheet(leagueId, sheet) {
    return this.mutateLeague(leagueId, (draft) => {
      draft.sheets.push(clone(sheet));
      draft.auditLog.push(auditEntry('sheet.submitted', `${sheet.name} locked a Week ${sheet.week} sheet`, sheet.playerId ?? sheet.name, { sheetId: sheet.id }));
      return sheet;
    });
  }

  async upsertResult(leagueId, gameId, result, actor) {
    const verifiedAt = new Date().toISOString();
    const saved = { ...clone(result), verifiedAt, verifiedBy: actor };
    return this.mutateLeague(leagueId, (draft) => {
      draft.results[gameId] = saved;
      draft.auditLog.push(auditEntry('result.verified', `Game ${gameId} result verified: ${result.winner}`, actor, { gameId, ...result }, verifiedAt));
      return saved;
    });
  }

  async saveRecap(leagueId, recap, { inTransaction = false } = {}) {
    return this.mutateLeague(leagueId, (draft) => {
      const index = draft.recaps.findIndex((item) => item.id === recap.id);
      if (index >= 0) draft.recaps[index] = clone(recap);
      else draft.recaps.push(clone(recap));
      if (!inTransaction) draft.auditLog.push(auditEntry('recap.saved', `Week ${recap.week} recap saved as ${recap.adminApproval?.status ?? 'draft'}`, 'system', { recapId: recap.id }));
      return recap;
    });
  }

  async getRecap(recapId) {
    const state = await this.findStateContaining('recaps', recapId);
    const recap = state?.recaps.find((item) => item.id === recapId);
    return recap ? { leagueId: state.id, ...clone(recap) } : null;
  }

  async saveSideBet(leagueId, bet, { inTransaction = false } = {}) {
    return this.mutateLeague(leagueId, (draft) => {
      const index = draft.sideBets.findIndex((item) => item.id === bet.id);
      if (index >= 0) draft.sideBets[index] = clone(bet);
      else draft.sideBets.push(clone(bet));
      if (!inTransaction) draft.auditLog.push(auditEntry('side_bet.updated', `Side bet ${bet.id} is ${bet.proposalStatus}${bet.settlementStatus ? ` / ${bet.settlementStatus}` : ''}`, 'system', { betId: bet.id }));
      return bet;
    });
  }

  async getSideBet(betId) {
    const state = await this.findStateContaining('sideBets', betId);
    const bet = state?.sideBets.find((item) => item.id === betId);
    return bet ? { leagueId: state.id, ...clone(bet) } : null;
  }

  async saveBroadcast(leagueId, broadcast, { inTransaction = false } = {}) {
    return this.mutateLeague(leagueId, (draft) => {
      const index = draft.broadcasts.findIndex((item) => item.id === broadcast.id);
      if (index >= 0) draft.broadcasts[index] = clone(broadcast);
      else draft.broadcasts.push(clone(broadcast));
      if (!inTransaction) draft.auditLog.push(auditEntry('broadcast.saved', `Broadcast ${broadcast.id} is ${broadcast.status}`, 'system', { broadcastId: broadcast.id }));
      return broadcast;
    });
  }

  async findBroadcastByProviderMessageId(providerMessageId) {
    const states = await this.readAllStates();
    for (const state of states) {
      for (const broadcast of state.broadcasts ?? []) {
        const deliveryIndex = (broadcast.deliveries ?? []).findIndex((delivery) => delivery.providerMessageId === providerMessageId);
        if (deliveryIndex >= 0) return { leagueId: state.id, broadcast: clone(broadcast), deliveryIndex };
      }
    }
    return null;
  }

  async addChatMessage(leagueId, message) {
    return this.mutateLeague(leagueId, (draft) => {
      draft.chat.push(clone(message));
      return message;
    });
  }

  async createPlayer(leagueId, player, pinHash) {
    const at = new Date().toISOString();
    return this.mutateLeague(leagueId, (draft) => {
      draft.players.push({ ...clone(player), leagueId });
      draft.playerCredentials ??= {};
      draft.playerCredentials[player.id] = { playerId: player.id, pinHash, updatedAt: at };
      if (player.messaging?.smsConsent) {
        draft.consentRecords.push({ id: randomUUID(), playerId: player.id, channel: 'sms_results', status: player.messaging.smsConsent, source: 'registration', recordedAt: at });
      }
      draft.auditLog.push(auditEntry('player.registered', `${player.name} joined the league`, player.id, { playerId: player.id }, at));
      return authenticatedPlayer(draft.players.at(-1));
    });
  }

  async saveSurvivorPick(leagueId, pick) {
    return this.mutateLeague(leagueId, (draft) => {
      draft.survivorPicks ??= [];
      const index = draft.survivorPicks.findIndex((item) => item.playerId === pick.playerId && item.week === pick.week);
      if (index >= 0) draft.survivorPicks[index] = clone(pick);
      else draft.survivorPicks.push(clone(pick));
      draft.auditLog.push(auditEntry('survivor.pick_saved', `Survivor pick for Week ${pick.week}: ${pick.team}`, pick.playerId, { week: pick.week, team: pick.team }));
      return pick;
    });
  }

  async savePayout(leagueId, payout) {
    return this.mutateLeague(leagueId, (draft) => {
      draft.payouts ??= [];
      draft.payouts.push(clone(payout));
      draft.auditLog.push(auditEntry('payout.recorded', `Week ${payout.week} pot of $${payout.amount} marked paid to ${payout.winnerNames?.join(' & ') ?? 'winner'}`, payout.paidBy ?? 'admin', { payoutId: payout.id, week: payout.week, amount: payout.amount }));
      return payout;
    });
  }

  async startSeason(leagueId, { week = 1, actor = 'commissioner' } = {}) {
    const demoPlayerIds = new Set(DEMO_LEAGUE.players.map((player) => player.id));
    const containsDemoPlayer = (value) => {
      const text = JSON.stringify(value ?? null);
      return [...demoPlayerIds].some((id) => text.includes(id));
    };
    return this.mutateLeague(leagueId, (draft) => {
      const removed = (draft.players ?? []).filter((player) => demoPlayerIds.has(player.id)).map((player) => player.name);
      draft.players = (draft.players ?? []).filter((player) => !demoPlayerIds.has(player.id));
      for (const id of demoPlayerIds) delete (draft.playerCredentials ?? {})[id];
      draft.consentRecords = (draft.consentRecords ?? []).filter((record) => !demoPlayerIds.has(record.playerId));
      draft.sheets = (draft.sheets ?? []).filter((sheet) => !demoPlayerIds.has(sheet.playerId));
      draft.results = Object.fromEntries(Object.entries(draft.results ?? {}).filter(([, result]) => result?.verifiedBy !== 'Commissioner Demo'));
      draft.recaps = (draft.recaps ?? []).filter((recap) => recap.id !== DEMO_LEAGUE.recap.id);
      draft.sideBets = (draft.sideBets ?? []).filter((bet) => !containsDemoPlayer(bet));
      draft.broadcasts = (draft.broadcasts ?? []).filter((broadcast) => broadcast.id !== DEMO_LEAGUE.broadcast.id && !containsDemoPlayer(broadcast.deliveries));
      draft.chat = (draft.chat ?? []).filter((message) => !demoPlayerIds.has(message.playerId));
      draft.survivorPicks = (draft.survivorPicks ?? []).filter((pick) => !demoPlayerIds.has(pick.playerId));
      draft.payouts = (draft.payouts ?? []).filter((payout) => !containsDemoPlayer(payout));
      draft.week = week;
      draft.auditLog.push(auditEntry('season.started', `Season started at Week ${week}. Demo players removed: ${removed.join(', ') || 'none (already clean)'}`, actor, { removedCount: removed.length, week }));
      return { removed, week, playerCount: draft.players.length };
    });
  }

  async writeAudit(leagueId, event, detail, actor = 'system', metadata = {}, at = new Date().toISOString()) {
    return this.mutateLeague(leagueId, (draft) => {
      const entry = auditEntry(event, detail, actor, metadata, at);
      draft.auditLog.push(entry);
      return { leagueId, ...entry };
    });
  }

  async close() {}
}
