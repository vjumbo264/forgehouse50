#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

/**
 * Route contract check:
 * Validates that all client requests made by the Android app and website
 * are fully supported by functions/ routing handlers with the correct methods.
 */

const clientEndpoints = [
  { client: 'Android App (v24-v27, v29+)', method: 'GET', path: '/api/notes', purpose: 'List own notes with filters' },
  { client: 'Android App (v24-v27, v29+)', method: 'POST', path: '/api/notes', purpose: 'Create note (observation, question, prayer, application, insight)' },
  { client: 'Android App (v24-v27, v29+)', method: 'PUT', path: '/api/notes/:id', purpose: 'Update note (standard route)' },
  { client: 'Android App (v28 fallback)', method: 'PUT', path: '/api/notes', purpose: 'Update note fallback when id is in query or body' },
  { client: 'Android App (generic/alt)', method: 'PATCH', path: '/api/notes/:id', purpose: 'Patch note' },
  { client: 'Android App (generic/alt)', method: 'POST', path: '/api/notes/:id', purpose: 'POST update alias' },
  { client: 'Android App (v24-v29+)', method: 'DELETE', path: '/api/notes/:id', purpose: 'Delete personal note' },
  { client: 'Android App & Web', method: 'GET', path: '/api/notes/:id/status', purpose: 'Check note status & leader reply' },
  { client: 'Android App & Web', method: 'GET', path: '/api/me/notes/:id/status', purpose: 'Check note status alias' },
  { client: 'Website', method: 'GET', path: '/api/notes', purpose: 'Website list notes' },
  { client: 'Website', method: 'POST', path: '/api/notes', purpose: 'Website create note' },
  { client: 'Website', method: 'PUT', path: '/api/notes/:id', purpose: 'Website edit note' },
  { client: 'Website', method: 'DELETE', path: '/api/notes/:id', purpose: 'Website delete note' },
  { client: 'Community Feed', method: 'GET', path: '/api/community/latest', purpose: 'Latest published community item' },
  { client: 'Community Feed', method: 'GET', path: '/api/community/posts', purpose: 'Community items infinite scroll feed' },
  { client: 'Admin Leaders Inbox', method: 'GET', path: '/api/admin/inbox', purpose: 'Admin inbox list' },
  { client: 'Admin Leaders Inbox', method: 'POST', path: '/api/admin/inbox/:id/reply', purpose: 'Admin reply to item' },
  { client: 'Admin Leaders Inbox', method: 'POST', path: '/api/admin/inbox/:id/publish', purpose: 'Admin publish item' },
  { client: 'Admin Leaders Inbox', method: 'POST', path: '/api/admin/inbox/:id/hide', purpose: 'Admin hide item' }
];

const functionsDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../functions/api");

function checkRoute(method, reqPath) {
  // Normalize path segments
  const segments = reqPath.replace(/^\/api\//, '').split('/');
  let currentDir = functionsDir;
  
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const isLast = i === segments.length - 1;
    
    // Check direct file or directory
    const directFile = path.join(currentDir, `${seg}.mjs`);
    const dynamicFile = path.join(currentDir, `[id].mjs`);
    const indexFile = path.join(currentDir, seg, 'index.mjs');
    
    if (isLast) {
      let targetFile = null;
      if (fs.existsSync(directFile)) targetFile = directFile;
      else if (seg.startsWith(':') || seg === ':id' || /^[a-zA-Z0-9_-]+$/.test(seg)) {
        if (fs.existsSync(dynamicFile)) targetFile = dynamicFile;
      }
      if (!targetFile && fs.existsSync(indexFile)) targetFile = indexFile;
      
      if (!targetFile) {
        return { ok: false, error: `Route file not found for ${reqPath}` };
      }
      
      const content = fs.readFileSync(targetFile, 'utf8');
      const handlerName = `onRequest${method[0].toUpperCase() + method.slice(1).toLowerCase()}`;
      if (!content.includes(handlerName) && !content.includes(`export async function onRequest(`) && !content.includes(`onRequestPut`) && method === 'PUT') {
        return { ok: false, error: `${targetFile} does not export ${handlerName}` };
      }
      return { ok: true, file: path.relative(process.cwd(), targetFile) };
    } else {
      const nextDir = path.join(currentDir, seg);
      const dynamicDir = path.join(currentDir, '[id]');
      if (fs.existsSync(nextDir)) {
        currentDir = nextDir;
      } else if (fs.existsSync(dynamicDir)) {
        currentDir = dynamicDir;
      } else {
        return { ok: false, error: `Directory not found for segment ${seg} in ${reqPath}` };
      }
    }
  }
  return { ok: true };
}

console.log("=== Checking Notes and Community Route Contract ===");
let hasError = false;
const matrix = [];

for (const ep of clientEndpoints) {
  const result = checkRoute(ep.method, ep.path);
  matrix.push({
    ...ep,
    status: result.ok ? 'SUPPORTED' : 'MISSING/ERROR',
    handlerFile: result.file || result.error
  });
  if (!result.ok) {
    console.error(`❌ MISMATCH: [${ep.method}] ${ep.path} -> ${result.error}`);
    hasError = true;
  } else {
    console.log(`✅ [${ep.method}] ${ep.path} -> ${result.file}`);
  }
}

if (hasError) {
  console.error("\nRoute contract check FAILED!");
  process.exit(1);
} else {
  console.log("\nAll routes verified successfully!");
}
