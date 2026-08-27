import { PostgresLeagueStore } from '../server/postgresStore.js';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required. Run `vercel env pull .env.local --yes` first.');

const store = new PostgresLeagueStore(process.env.DATABASE_URL);
await store.migrate();
await store.close();
console.log('Neon schema migration complete.');
