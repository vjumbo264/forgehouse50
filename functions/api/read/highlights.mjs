// GET /api/read/highlights — plural alias kept in sync with the read.html
// frontend, which fetches highlights at the plural path. Pages Functions
// route by filename, so this re-exports the canonical handlers.
export { onRequestGet, onRequestPost, onRequestDelete } from './highlight.mjs';
