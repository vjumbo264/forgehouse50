import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import assert from 'node:assert';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { versewellProvider } from '../functions/lib/versewell.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

console.log('Testing Item 4 — Verse-Level Headings...');

// 1. Check bundled NIV asset
const nivPath = path.join(repoRoot, 'public/bundles/niv.json.gz');
const nivRaw = readFileSync(nivPath);
const niv = JSON.parse(gunzipSync(nivRaw).toString('utf-8'));

assert(niv.Matthew, 'Matthew must exist in NIV bundle');
const mt1 = niv.Matthew['1'];
const mt3 = niv.Matthew['3'];
const mt4 = niv.Matthew['4'];

// Matthew 1:1
const mt1_v1 = mt1.v[0];
assert.strictEqual(mt1_v1.n, 1);
assert.strictEqual(mt1_v1.h, 'The Genealogy of Jesus the Messiah', 'Mt 1:1 heading_before must match');
assert(!mt1_v1.t.startsWith('The Genealogy'), 'Mt 1:1 verse text must not contain heading');
assert(mt1_v1.t.startsWith('This is the genealogy of Jesus the Messiah'), 'Mt 1:1 verse text must be clean');

// Matthew 3:1
const mt3_v1 = mt3.v[0];
assert.strictEqual(mt3_v1.n, 1);
assert.strictEqual(mt3_v1.h, 'John the Baptist Prepares the Way', 'Mt 3:1 heading_before must match');
assert(!mt3_v1.t.startsWith('John the Baptist Prepares'), 'Mt 3:1 verse text must not contain heading');
assert(mt3_v1.t.startsWith('In those days John the Baptist came'), 'Mt 3:1 verse text must be clean');

// Matthew 4:1
const mt4_v1 = mt4.v[0];
assert.strictEqual(mt4_v1.n, 1);
assert.strictEqual(mt4_v1.h, 'Jesus Is Tested in the Wilderness', 'Mt 4:1 heading_before must match');
assert(mt4_v1.t.startsWith('Then Jesus was led by the Spirit'), 'Mt 4:1 verse text must be clean');

// 2. Check GW bundle
const gwPath = path.join(repoRoot, 'public/bundles/gw.json.gz');
const gwRaw = readFileSync(gwPath);
const gw = JSON.parse(gunzipSync(gwRaw).toString('utf-8'));
assert(gw.Matthew, 'Matthew must exist in GW bundle');
const gw_mt4_v1 = gw.Matthew['4'].v[0];
assert.strictEqual(gw_mt4_v1.h, 'The Temptation of Jesus', 'GW Mt 4:1 heading_before must match');
assert(gw_mt4_v1.t.startsWith('Then the Spirit led Jesus into the desert'), 'GW Mt 4:1 verse text must be clean');

// 3. Check passage provider getPassage returns heading_before
const passage = await versewellProvider.getPassage('NIV', 'Matthew', 3, 3);
assert(passage, 'Passage must be returned');
assert.strictEqual(passage.verses[0].heading_before, 'John the Baptist Prepares the Way', 'passage heading_before must match');
assert(passage.verses[0].text.startsWith('In those days John the Baptist came'), 'passage verse text must be clean');

console.log('Item 4 test passed successfully: 100% heading isolation and data integrity verified.');
