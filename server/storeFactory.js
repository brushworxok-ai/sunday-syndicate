import { PostgresLeagueStore } from './postgresStore.js';

export async function createLeagueStore({ databaseUrl = process.env.DATABASE_URL, databasePath } = {}) {
  if (databaseUrl) {
    const store = new PostgresLeagueStore(databaseUrl);
    await store.migrate();
    return store;
  }
  // Dynamic import: node:sqlite is only available in Node 22.5+ / 24+
  const { LeagueStore } = await import('./store.js');
  return new LeagueStore(databasePath);
}
