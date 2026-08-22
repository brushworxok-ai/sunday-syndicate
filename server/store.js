import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DEMO_CHAT, DEMO_LEAGUE } from '../src/demoLeague.js';
import { hashPin } from './auth.js';

const parse = (value, fallback = null) => {
  if (value == null) return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
};

const stringify = (value) => JSON.stringify(value ?? null);

export class LeagueStore {
  constructor(filename = ':memory:') {
    this.kind = 'sqlite';
    if (filename !== ':memory:') mkdirSync(path.dirname(filename), { recursive: true });
    this.db = new DatabaseSync(filename);
    this.db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
    this.migrate();
  }

  migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS leagues (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        week INTEGER NOT NULL,
        settings_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS players (
        id TEXT PRIMARY KEY,
        league_id TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        previous_rank INTEGER,
        phone_masked TEXT,
        phone_e164 TEXT,
        phone_verified_at TEXT,
        messaging_json TEXT NOT NULL,
        trash_talk_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS consent_records (
        id TEXT PRIMARY KEY,
        league_id TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
        player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        channel TEXT NOT NULL,
        status TEXT NOT NULL,
        source TEXT NOT NULL,
        recorded_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS player_credentials (
        player_id TEXT PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
        pin_hash TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sheets (
        id TEXT PRIMARY KEY,
        league_id TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
        player_id TEXT,
        name TEXT NOT NULL,
        handle TEXT,
        picks_json TEXT NOT NULL,
        tiebreaker INTEGER NOT NULL,
        paid INTEGER NOT NULL,
        week INTEGER NOT NULL,
        submitted_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS results (
        league_id TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
        game_id TEXT NOT NULL,
        result_json TEXT NOT NULL,
        verified_at TEXT,
        verified_by TEXT,
        PRIMARY KEY (league_id, game_id)
      );
      CREATE TABLE IF NOT EXISTS recaps (
        id TEXT PRIMARY KEY,
        league_id TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
        week INTEGER NOT NULL,
        data_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS side_bets (
        id TEXT PRIMARY KEY,
        league_id TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
        data_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS broadcasts (
        id TEXT PRIMARY KEY,
        league_id TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
        recap_id TEXT,
        data_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS survivor_picks (
        league_id TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
        player_id TEXT NOT NULL,
        week INTEGER NOT NULL,
        team TEXT NOT NULL,
        picked_at TEXT NOT NULL,
        PRIMARY KEY (league_id, player_id, week)
      );
      CREATE TABLE IF NOT EXISTS payouts (
        id TEXT PRIMARY KEY,
        league_id TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
        data_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS chat_messages (
        id TEXT PRIMARY KEY,
        league_id TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
        player_id TEXT,
        name TEXT NOT NULL,
        message TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        league_id TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
        event_at TEXT NOT NULL,
        event TEXT NOT NULL,
        detail TEXT NOT NULL,
        actor TEXT NOT NULL,
        metadata_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_audit_league_time ON audit_logs(league_id, event_at);
      CREATE INDEX IF NOT EXISTS idx_recaps_league_week ON recaps(league_id, week);
      CREATE INDEX IF NOT EXISTS idx_bets_league ON side_bets(league_id);
    `);
    // Legacy databases created broadcasts.recap_id as NOT NULL with an FK,
    // which blocks standalone Jack broadcasts. Rebuild the table if needed.
    const recapCol = this.db.prepare('PRAGMA table_info(broadcasts)').all().find((col) => col.name === 'recap_id');
    if (recapCol && recapCol.notnull === 1) {
      this.db.exec(`
        PRAGMA foreign_keys = OFF;
        BEGIN;
        CREATE TABLE broadcasts_migrated (
          id TEXT PRIMARY KEY,
          league_id TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
          recap_id TEXT,
          data_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        INSERT INTO broadcasts_migrated SELECT id, league_id, recap_id, data_json, created_at, updated_at FROM broadcasts;
        DROP TABLE broadcasts;
        ALTER TABLE broadcasts_migrated RENAME TO broadcasts;
        COMMIT;
        PRAGMA foreign_keys = ON;
      `);
    }
  }

  seedDemo({ force = false } = {}) {
    const existing = this.db.prepare('SELECT id FROM leagues WHERE id = ?').get(DEMO_LEAGUE.id);
    if (existing && !force) return false;
    this.db.exec('BEGIN IMMEDIATE');
    try {
      if (existing) this.db.prepare('DELETE FROM leagues WHERE id = ?').run(DEMO_LEAGUE.id);
      const now = '2025-11-18T18:00:00.000Z';
      this.db.prepare('INSERT INTO leagues (id, name, week, settings_json, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(DEMO_LEAGUE.id, DEMO_LEAGUE.name, DEMO_LEAGUE.week, stringify(DEMO_LEAGUE.settings), now);

      const insertPlayer = this.db.prepare(`INSERT INTO players
        (id, league_id, name, previous_rank, phone_masked, phone_e164, phone_verified_at, messaging_json, trash_talk_json, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      const insertConsent = this.db.prepare(`INSERT INTO consent_records
        (id, league_id, player_id, channel, status, source, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?)`);
      for (const player of DEMO_LEAGUE.players) {
        insertPlayer.run(player.id, DEMO_LEAGUE.id, player.name, player.previousRank, player.phone, null, player.phoneVerifiedAt, stringify(player.messaging), stringify(player.trashTalk), player.trashTalk.updatedAt);
        insertConsent.run(`consent-${player.id}-sms`, DEMO_LEAGUE.id, player.id, 'sms_results', player.messaging.smsConsent, player.messaging.optedOutAt ? 'sms_stop' : 'player_settings', player.messaging.optedOutAt ?? player.messaging.consentedAt);
        insertConsent.run(`consent-${player.id}-roast`, DEMO_LEAGUE.id, player.id, 'trash_talk', player.trashTalk.level, 'player_settings', player.trashTalk.updatedAt);
        const demoPin = player.phone.replace(/\D/g, '').slice(-4).padStart(4, '0');
        this.db.prepare('INSERT INTO player_credentials (player_id, pin_hash, updated_at) VALUES (?, ?, ?)').run(player.id, hashPin(demoPin), now);
      }

      const insertSheet = this.db.prepare(`INSERT INTO sheets
        (id, league_id, player_id, name, handle, picks_json, tiebreaker, paid, week, submitted_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      for (const sheet of DEMO_LEAGUE.sheets) insertSheet.run(sheet.id, DEMO_LEAGUE.id, sheet.playerId, sheet.name, sheet.handle ?? '', stringify(sheet.picks), sheet.tiebreaker, sheet.paid ? 1 : 0, sheet.week, sheet.submittedAt);

      const insertResult = this.db.prepare(`INSERT INTO results
        (league_id, game_id, result_json, verified_at, verified_by) VALUES (?, ?, ?, ?, ?)`);
      for (const [gameId, result] of Object.entries(DEMO_LEAGUE.results)) insertResult.run(DEMO_LEAGUE.id, gameId, stringify(result), DEMO_LEAGUE.recap.factsSnapshot.resultsFinalizedAt, 'Commissioner Demo');

      this.saveRecap(DEMO_LEAGUE.id, DEMO_LEAGUE.recap, { inTransaction: true });
      for (const bet of DEMO_LEAGUE.sideBets) this.saveSideBet(DEMO_LEAGUE.id, bet, { inTransaction: true });
      this.saveBroadcast(DEMO_LEAGUE.id, DEMO_LEAGUE.broadcast, { inTransaction: true });

      const insertChat = this.db.prepare('INSERT INTO chat_messages (id, league_id, player_id, name, message, created_at) VALUES (?, ?, ?, ?, ?, ?)');
      for (const message of DEMO_CHAT) {
        const player = DEMO_LEAGUE.players.find((candidate) => candidate.name === message.name);
        insertChat.run(message.id, DEMO_LEAGUE.id, player?.id ?? null, message.name, message.msg, message.time);
      }
      for (const entry of DEMO_LEAGUE.auditLog) this.writeAudit(DEMO_LEAGUE.id, entry.event, entry.detail, 'system', {}, entry.at, { inTransaction: true });
      this.db.exec('COMMIT');
      return true;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  getLeague(leagueId) {
    const league = this.db.prepare('SELECT * FROM leagues WHERE id = ?').get(leagueId);
    if (!league) return null;
    const players = this.db.prepare('SELECT * FROM players WHERE league_id = ? ORDER BY name').all(leagueId).map((row) => ({
      id: row.id,
      name: row.name,
      previousRank: row.previous_rank,
      phone: row.phone_masked,
      phoneVerifiedAt: row.phone_verified_at,
      messaging: parse(row.messaging_json, {}),
      trashTalk: parse(row.trash_talk_json, {}),
    }));
    const sheets = this.db.prepare('SELECT * FROM sheets WHERE league_id = ? ORDER BY submitted_at').all(leagueId).map((row) => ({
      id: row.id, playerId: row.player_id, name: row.name, handle: row.handle, picks: parse(row.picks_json, {}), tiebreaker: row.tiebreaker, paid: Boolean(row.paid), week: row.week, submittedAt: row.submitted_at,
    }));
    const results = Object.fromEntries(this.db.prepare('SELECT * FROM results WHERE league_id = ? ORDER BY game_id').all(leagueId).map((row) => [row.game_id, { ...parse(row.result_json, {}), verifiedAt: row.verified_at, verifiedBy: row.verified_by }]));
    const recaps = this.db.prepare('SELECT data_json FROM recaps WHERE league_id = ? ORDER BY created_at DESC').all(leagueId).map((row) => parse(row.data_json, {}));
    const sideBets = this.db.prepare('SELECT data_json FROM side_bets WHERE league_id = ? ORDER BY created_at DESC').all(leagueId).map((row) => parse(row.data_json, {}));
    const broadcasts = this.db.prepare('SELECT data_json FROM broadcasts WHERE league_id = ? ORDER BY created_at DESC').all(leagueId).map((row) => parse(row.data_json, {}));
    const chat = this.db.prepare('SELECT * FROM chat_messages WHERE league_id = ? ORDER BY created_at').all(leagueId).map((row) => ({ id: row.id, playerId: row.player_id, name: row.name, msg: row.message, time: row.created_at }));
    const auditLog = this.db.prepare('SELECT * FROM audit_logs WHERE league_id = ? ORDER BY event_at DESC LIMIT 100').all(leagueId).map((row) => ({ id: row.id, at: row.event_at, event: row.event, detail: row.detail, actor: row.actor, metadata: parse(row.metadata_json, {}) }));
    const consentRecords = this.db.prepare('SELECT * FROM consent_records WHERE league_id = ? ORDER BY recorded_at DESC').all(leagueId).map((row) => ({ id: row.id, playerId: row.player_id, channel: row.channel, status: row.status, source: row.source, recordedAt: row.recorded_at }));
    const survivorPicks = this.db.prepare('SELECT * FROM survivor_picks WHERE league_id = ? ORDER BY week, picked_at').all(leagueId).map((row) => ({ playerId: row.player_id, week: row.week, team: row.team, pickedAt: row.picked_at }));
    const payouts = this.db.prepare('SELECT data_json FROM payouts WHERE league_id = ? ORDER BY created_at DESC').all(leagueId).map((row) => parse(row.data_json, {}));
    return { id: league.id, name: league.name, week: league.week, settings: parse(league.settings_json, {}), players, sheets, results, recaps, latestRecap: recaps[0] ?? null, sideBets, broadcasts, latestBroadcast: broadcasts[0] ?? null, chat, auditLog, consentRecords, survivorPicks, payouts };
  }

  getPlayer(playerId) {
    const row = this.db.prepare('SELECT * FROM players WHERE id = ?').get(playerId);
    if (!row) return null;
    return { id: row.id, leagueId: row.league_id, name: row.name, phone: row.phone_masked, phoneE164: row.phone_e164, phoneVerifiedAt: row.phone_verified_at, messaging: parse(row.messaging_json, {}), trashTalk: parse(row.trash_talk_json, {}) };
  }

  getPlayerCredential(playerId) {
    const row = this.db.prepare('SELECT player_id, pin_hash FROM player_credentials WHERE player_id = ?').get(playerId);
    return row ? { playerId: row.player_id, pinHash: row.pin_hash } : null;
  }

  findPlayerByPhoneE164(phoneE164) {
    const row = this.db.prepare('SELECT id FROM players WHERE phone_e164 = ?').get(phoneE164);
    return row ? this.getPlayer(row.id) : null;
  }

  updatePlayerPreferences(playerId, preferences, actor = 'player') {
    const player = this.getPlayer(playerId);
    if (!player) return null;
    const at = new Date().toISOString();
    const messaging = { ...player.messaging };
    const trashTalk = { ...player.trashTalk };
    if (preferences.smsConsent) {
      messaging.smsConsent = preferences.smsConsent;
      if (preferences.smsConsent === 'opted_in') { messaging.consentedAt = at; delete messaging.optedOutAt; }
      else messaging.optedOutAt = at;
    }
    if (preferences.resultsChannel) messaging.resultsChannel = preferences.resultsChannel;
    if (preferences.trashTalkLevel) { trashTalk.level = preferences.trashTalkLevel; trashTalk.updatedAt = at; }
    if (preferences.trashTalk) Object.assign(trashTalk, preferences.trashTalk);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare('UPDATE players SET messaging_json = ?, trash_talk_json = ?, updated_at = ? WHERE id = ?').run(stringify(messaging), stringify(trashTalk), at, playerId);
      if (preferences.smsConsent) this.db.prepare('INSERT INTO consent_records (id, league_id, player_id, channel, status, source, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(randomUUID(), player.leagueId, playerId, 'sms_results', preferences.smsConsent, actor === 'twilio_webhook' ? 'sms_keyword' : 'player_settings', at);
      if (preferences.trashTalkLevel) this.db.prepare('INSERT INTO consent_records (id, league_id, player_id, channel, status, source, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(randomUUID(), player.leagueId, playerId, 'trash_talk', preferences.trashTalkLevel, 'player_settings', at);
      this.writeAudit(player.leagueId, 'player.preferences_updated', `${player.name} updated communication preferences`, actor, { playerId, changes: preferences }, at, { inTransaction: true });
      this.db.exec('COMMIT');
      return this.getPlayer(playerId);
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }

  updateLeagueSettings(leagueId, settings) {
    this.db.prepare('UPDATE leagues SET settings_json = ? WHERE id = ?').run(stringify(settings), leagueId);
    this.writeAudit(leagueId, 'league.settings_updated', 'League settings updated', 'admin', { keys: Object.keys(settings) });
    return settings;
  }

  createSheet(leagueId, sheet) {
    this.db.prepare(`INSERT INTO sheets (id, league_id, player_id, name, handle, picks_json, tiebreaker, paid, week, submitted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(sheet.id, leagueId, sheet.playerId ?? null, sheet.name, sheet.handle ?? '', stringify(sheet.picks), sheet.tiebreaker, sheet.paid ? 1 : 0, sheet.week, sheet.submittedAt);
    this.writeAudit(leagueId, 'sheet.submitted', `${sheet.name} locked a Week ${sheet.week} sheet`, sheet.playerId ?? sheet.name, { sheetId: sheet.id });
    return sheet;
  }

  upsertResult(leagueId, gameId, result, actor) {
    const verifiedAt = new Date().toISOString();
    this.db.prepare(`INSERT INTO results (league_id, game_id, result_json, verified_at, verified_by) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(league_id, game_id) DO UPDATE SET result_json=excluded.result_json, verified_at=excluded.verified_at, verified_by=excluded.verified_by`)
      .run(leagueId, gameId, stringify(result), verifiedAt, actor);
    this.writeAudit(leagueId, 'result.verified', `Game ${gameId} result verified: ${result.winner}`, actor, { gameId, ...result });
    return { ...result, verifiedAt, verifiedBy: actor };
  }

  saveRecap(leagueId, recap, { inTransaction = false } = {}) {
    const at = recap.generatedAt ?? new Date().toISOString();
    this.db.prepare(`INSERT INTO recaps (id, league_id, week, data_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET data_json=excluded.data_json, updated_at=excluded.updated_at`)
      .run(recap.id, leagueId, recap.week, stringify(recap), at, new Date().toISOString());
    if (!inTransaction) this.writeAudit(leagueId, 'recap.saved', `Week ${recap.week} recap saved as ${recap.adminApproval?.status ?? 'draft'}`, 'system', { recapId: recap.id });
    return recap;
  }

  getRecap(recapId) {
    const row = this.db.prepare('SELECT league_id, data_json FROM recaps WHERE id = ?').get(recapId);
    return row ? { leagueId: row.league_id, ...parse(row.data_json, {}) } : null;
  }

  saveSideBet(leagueId, bet, { inTransaction = false } = {}) {
    const createdAt = bet.createdAt ?? new Date().toISOString();
    this.db.prepare(`INSERT INTO side_bets (id, league_id, data_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET data_json=excluded.data_json, updated_at=excluded.updated_at`)
      .run(bet.id, leagueId, stringify(bet), createdAt, new Date().toISOString());
    if (!inTransaction) this.writeAudit(leagueId, 'side_bet.updated', `Side bet ${bet.id} is ${bet.proposalStatus}${bet.settlementStatus ? ` / ${bet.settlementStatus}` : ''}`, 'system', { betId: bet.id });
    return bet;
  }

  getSideBet(betId) {
    const row = this.db.prepare('SELECT league_id, data_json FROM side_bets WHERE id = ?').get(betId);
    return row ? { leagueId: row.league_id, ...parse(row.data_json, {}) } : null;
  }

  saveBroadcast(leagueId, broadcast, { inTransaction = false } = {}) {
    const createdAt = broadcast.sentAt ?? new Date().toISOString();
    this.db.prepare(`INSERT INTO broadcasts (id, league_id, recap_id, data_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET data_json=excluded.data_json, updated_at=excluded.updated_at`)
      .run(broadcast.id, leagueId, broadcast.recapId ?? null, stringify(broadcast), createdAt, new Date().toISOString());
    if (!inTransaction) this.writeAudit(leagueId, 'broadcast.saved', `Broadcast ${broadcast.id} is ${broadcast.status}`, 'system', { broadcastId: broadcast.id });
    return broadcast;
  }

  findBroadcastByProviderMessageId(providerMessageId) {
    const rows = this.db.prepare('SELECT league_id, data_json FROM broadcasts ORDER BY created_at DESC').all();
    for (const row of rows) {
      const broadcast = parse(row.data_json, {});
      const deliveryIndex = (broadcast.deliveries ?? []).findIndex((delivery) => delivery.providerMessageId === providerMessageId);
      if (deliveryIndex >= 0) return { leagueId: row.league_id, broadcast, deliveryIndex };
    }
    return null;
  }

  addChatMessage(leagueId, message) {
    this.db.prepare('INSERT INTO chat_messages (id, league_id, player_id, name, message, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(message.id, leagueId, message.playerId ?? null, message.name, message.msg, message.time);
    return message;
  }

  createPlayer(leagueId, player, pinHash) {
    const at = new Date().toISOString();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare(`INSERT INTO players
        (id, league_id, name, previous_rank, phone_masked, phone_e164, phone_verified_at, messaging_json, trash_talk_json, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(player.id, leagueId, player.name, null, player.phone, player.phoneE164, player.phoneVerifiedAt ?? null, stringify(player.messaging), stringify(player.trashTalk), at);
      this.db.prepare('INSERT INTO player_credentials (player_id, pin_hash, updated_at) VALUES (?, ?, ?)').run(player.id, pinHash, at);
      if (player.messaging?.smsConsent) {
        this.db.prepare('INSERT INTO consent_records (id, league_id, player_id, channel, status, source, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .run(randomUUID(), leagueId, player.id, 'sms_results', player.messaging.smsConsent, 'registration', at);
      }
      this.writeAudit(leagueId, 'player.registered', `${player.name} joined the league`, player.id, { playerId: player.id }, at, { inTransaction: true });
      this.db.exec('COMMIT');
      return this.getPlayer(player.id);
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }

  saveSurvivorPick(leagueId, pick) {
    this.db.prepare(`INSERT INTO survivor_picks (league_id, player_id, week, team, picked_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(league_id, player_id, week) DO UPDATE SET team=excluded.team, picked_at=excluded.picked_at`)
      .run(leagueId, pick.playerId, pick.week, pick.team, pick.pickedAt);
    this.writeAudit(leagueId, 'survivor.pick_saved', `Survivor pick for Week ${pick.week}: ${pick.team}`, pick.playerId, { week: pick.week, team: pick.team });
    return pick;
  }

  savePayout(leagueId, payout) {
    this.db.prepare('INSERT INTO payouts (id, league_id, data_json, created_at) VALUES (?, ?, ?, ?)')
      .run(payout.id, leagueId, stringify(payout), payout.paidAt ?? new Date().toISOString());
    this.writeAudit(leagueId, 'payout.recorded', `Week ${payout.week} pot of $${payout.amount} marked paid to ${payout.winnerNames?.join(' & ') ?? 'winner'}`, payout.paidBy ?? 'admin', { payoutId: payout.id, week: payout.week, amount: payout.amount });
    return payout;
  }

  writeAudit(leagueId, event, detail, actor = 'system', metadata = {}, at = new Date().toISOString(), { inTransaction = false } = {}) {
    this.db.prepare('INSERT INTO audit_logs (id, league_id, event_at, event, detail, actor, metadata_json) VALUES (?, ?, ?, ?, ?, ?, ?)').run(randomUUID(), leagueId, at, event, detail, actor, stringify(metadata));
    return { leagueId, event, detail, actor, metadata, at, inTransaction };
  }

  close() { this.db.close(); }
}
