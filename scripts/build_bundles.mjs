// testing_phase_and_reader_fixes_v1 / ISSUE 3 (web) — build ONE gzipped JSON
// bundle per translation directly from the VerseWell static mirror (same
// source the live /api/read/passage uses; no auth needed). Output shape is
// EXACTLY the bundled-KJV asset the Android app already imports
// (books -> chapter -> { v:[{n,t,f}], i:[{s,e,t}] }) so the app reuses its
// proven importer; one HTTP fetch per translation replaces 260 chapter calls.
import { writeFileSync, mkdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
const VW = 'https://versewell.pages.dev/static-data';
const NT = [['Matthew',28],['Mark',16],['Luke',24],['John',21],['Acts',28],['Romans',16],['1 Corinthians',16],['2 Corinthians',13],['Galatians',6],['Ephesians',6],['Philippians',4],['Colossians',4],['1 Thessalonians',5],['2 Thessalonians',3],['1 Timothy',6],['2 Timothy',4],['Titus',3],['Philemon',1],['Hebrews',13],['James',5],['1 Peter',5],['2 Peter',3],['1 John',5],['2 John',1],['3 John',1],['Jude',1],['Revelation',22]];
async function j(u){ const r = await fetch(u); const ct=(r.headers.get('content-type')||'').toLowerCase(); if(!r.ok||!ct.includes('application/json')) return null; return r.json(); }
const top = await j(`${VW}/index.json`);
if(!top?.versions) throw new Error('versewell index unavailable');
mkdirSync('public/bundles', { recursive: true });
const manifest = [];
for (const v of top.versions) {
  const code = (v.code||'').toLowerCase(); if(!code) continue;
  const idx = await j(`${VW}/${code}/index.json`); if(!idx?.books) { console.log('skip (no index)', code); continue; }
  const books = {}; let ok = true;
  for (const [book, chapters] of NT) {
    const entry = idx.books.find(b => (b.book_name||'').trim().toLowerCase() === book.toLowerCase());
    if (!entry || entry.chapters < chapters) { console.log('missing', code, book); ok = false; break; }
    books[book] = {};
    for (let ch = 1; ch <= chapters; ch++) {
      const d = await j(`${VW}/${code}/${entry.slug}/${ch}.json`);
      if (!d?.verses?.length) { console.log('missing chapter', code, book, ch); ok = false; break; }
      books[book][String(ch)] = {
        v: d.verses.map(x => ({ n: x.verse, t: x.text, f: Array.isArray(x.footnotes) ? x.footnotes : [] })),
        i: (Array.isArray(d.intros) ? d.intros : []).map(x => ({ s: x.start_verse||0, e: x.end_verse||0, t: x.text||'' })),
      };
    }
    if (!ok) break;
  }
  if (!ok) continue;
  const file = `${code}.json.gz`;
  writeFileSync(`public/bundles/${file}`, gzipSync(JSON.stringify(books), { level: 9 }));
  const { size } = await import('node:fs').then(fs => fs.statSync(`public/bundles/${file}`));
  manifest.push({ id: `versewell-${code}`, code: v.code, name: v.name||v.code, url: `/bundles/${file}`, bytes: size, chapters: 260 });
  console.log('OK', code, size, 'bytes');
}
writeFileSync('public/bundles/manifest.json', JSON.stringify({ generated: new Date().toISOString(), bundles: manifest }, null, 2));
console.log('manifest:', manifest.length, 'bundles');
