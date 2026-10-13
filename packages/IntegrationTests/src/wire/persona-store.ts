/**
 * Reads and writes the local personas file (gitignored: it holds user API keys). Plain node:fs and node:path, so it is safe
 * on both sides of the wire.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PersonaKey, PersonaRecord, PersonasFile } from './persona-model.js';

/** `<repo>/test-harnesses/.personas.local.json`, or VOTING_WIRE_PERSONAS_FILE. Works from both src/ and dist/. */
export function PersonasFilePath(): string {
    const override = process.env.VOTING_WIRE_PERSONAS_FILE;
    if (override) return resolve(override);
    const here = dirname(fileURLToPath(import.meta.url)); // packages/IntegrationTests/{src,dist}/wire
    return resolve(here, '../../../../test-harnesses/.personas.local.json');
}

export function ReadPersonasFile(): PersonasFile | null {
    const file = PersonasFilePath();
    if (!existsSync(file)) return null;
    return JSON.parse(readFileSync(file, 'utf8')) as PersonasFile;
}

export function WritePersonasFile(data: PersonasFile): void {
    const file = PersonasFilePath();
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
}

/** The recorded persona, or throws telling the operator how to provision. */
export function RequirePersona(key: PersonaKey): PersonaRecord {
    const file = ReadPersonasFile();
    const record = file?.Personas.find((p) => p.Key === key);
    if (!record) {
        throw new Error(`Persona "${key}" is not provisioned. Run: pnpm --filter @mj-biz-apps/voting-integration-tests run provision:personas`);
    }
    return record;
}
