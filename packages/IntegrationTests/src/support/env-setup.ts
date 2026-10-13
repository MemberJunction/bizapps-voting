/**
 * Runs before any test file imports the voting server (importing @memberjunction/server validates its configuration from
 * the environment at load time). Loads the repo `.env` and pins the database. No value is printed.
 */
import { randomBytes } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const here = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(here, '../../../../.env'), quiet: true });

/**
 * The only database this suite may touch: MJ_Voting_Dev unless VOTING_IT_DATABASE names another private voting database
 * (for example `VOTING_IT_DATABASE=MJ_Voting_Perm pnpm test`). DB_DATABASE from the .env is never used.
 */
process.env.DB_DATABASE = process.env.VOTING_IT_DATABASE?.trim() || 'MJ_Voting_Dev';
// Random per run, held only in this process; never written anywhere.
process.env.VOTING_SELECTIONS_KEY = randomBytes(32).toString('base64');
