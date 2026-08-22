import { LeagueStore } from './store.js';
import { PostgresLeagueStore } from './postgresStore.js';

export async function createLeagueStore({ databaseUrl = process.env.DATABASE_URL, databasePath } = {}) {
  if (databaseUrl) {
    const store = new PostgresLeagueStore(databaseUrl);
    await store.migrate();
    return store;
  }
  return new LeagueStore(databasePath);
}
