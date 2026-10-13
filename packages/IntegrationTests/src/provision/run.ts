/** Entry point: `node dist/provision/run.js` (see the `provision:personas` script). */
import { GetHarness, TEST_DATABASE } from '../support/harness.js';
import { ProvisionPersonas } from './provision-personas.js';

console.log(`Provisioning wire personas in ${TEST_DATABASE}`);
try {
    const records = await ProvisionPersonas();
    console.log(`Done: ${records.length} personas.`);
    await (await GetHarness())?.Pool.close();
    process.exit(0);
} catch (e) {
    console.error('Provisioning failed:', e instanceof Error ? e.message : e);
    process.exit(1);
}
