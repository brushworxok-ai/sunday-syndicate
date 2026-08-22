import { PostgresLeagueStore } from '../server/postgresStore.js';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required. Run `vercel env pull .env.local --yes` first.');

const store = new PostgresLeagueStore(process.env.DATABASE_URL);
await store.migrate();
const seeded = await store.seedDemo({ force: process.argv.includes('--force') });
await store.close();
console.log(seeded ? 'Demo league seeded in Neon.' : 'Demo league already exists; no changes made.');
