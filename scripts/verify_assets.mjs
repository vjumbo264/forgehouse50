import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const publicDir = path.join(repoRoot, 'public');
const htmlFiles = [path.join(publicDir, 'index.html'), path.join(publicDir, 'app', 'index.html')];

let errors = 0;

for (const htmlFile of htmlFiles) {
  if (!fs.existsSync(htmlFile)) {
    console.error(`Missing HTML file: ${htmlFile}`);
    errors++;
    continue;
  }
  const content = fs.readFileSync(htmlFile, 'utf8');
  const regex = /(?:src|href)=["'](\/assets\/[^"']+)["']/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const assetPath = match[1];
    const diskPath = path.join(publicDir, assetPath);
    if (!fs.existsSync(diskPath)) {
      console.error(`Referenced asset does not exist on disk: ${assetPath} (in ${htmlFile})`);
      errors++;
    } else {
      const size = fs.statSync(diskPath).size;
      if (size === 0) {
        console.error(`Referenced asset is empty (0 bytes): ${assetPath}`);
        errors++;
      } else {
        console.log(`Verified asset: ${assetPath} (${size} bytes)`);
      }
    }
  }
}


// Verify all bundles in manifest have plain scalar footnotes (Item 1 CI gate)
import zlib from 'zlib';
const manifestPath = path.join(publicDir, 'bundles', 'manifest.json');
if (fs.existsSync(manifestPath)) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  for (const b of manifest.bundles || []) {
    const bPath = path.join(publicDir, b.url);
    if (!fs.existsSync(bPath)) {
      console.error('Missing bundle:', b.url);
      errors++;
      continue;
    }
    const raw = fs.readFileSync(bPath);
    const unzipped = (raw[0] === 0x1f && raw[1] === 0x8b) ? zlib.gunzipSync(raw) : raw;
    const data = JSON.parse(unzipped.toString('utf8'));
    for (const [book, chs] of Object.entries(data)) {
      if (typeof chs !== 'object') continue;
      for (const [ch, chData] of Object.entries(chs)) {
        for (const verse of chData.v || []) {
          for (const fn of verse.f || []) {
            if (typeof fn === 'object' && fn !== null) {
              console.error('Non-scalar footnote in bundle:', b.url, book, ch, verse.n, fn);
              errors++;
              break;
            }
          }
        }
      }
    }
  }
  console.log('Verified all manifest bundles: all footnotes are plain scalars.');
}

if (errors > 0) {
  console.error(`Asset verification FAILED with ${errors} error(s).`);
  process.exit(1);
} else {
  console.log('All referenced assets exist and are valid.');
}
