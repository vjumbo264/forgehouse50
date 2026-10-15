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

if (errors > 0) {
  console.error(`Asset verification FAILED with ${errors} error(s).`);
  process.exit(1);
} else {
  console.log('All referenced assets exist and are valid.');
}
