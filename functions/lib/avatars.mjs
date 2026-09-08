// Preset avatar ids — the single source of truth on the backend.
// These MUST match the ids in public/app.js (AVATARS). Each id is a
// "{icon}-{color}" pair rendered as an inline SVG icon on a colored circle.
// Used to validate avatar selection and to default avatar_id at signup.

export const AVATAR_IDS = [
  'dove-amber', 'dove-blue', 'flame-red', 'flame-orange', 'cross-violet',
  'cross-teal', 'fish-cyan', 'fish-blue', 'book-green', 'book-indigo',
  'star-amber', 'star-violet', 'heart-rose', 'heart-red', 'anchor-slate',
  'anchor-blue', 'sun-orange', 'sun-amber', 'lamp-amber', 'lamp-teal',
  'crown-purple', 'crown-amber', 'shield-green', 'shield-indigo', 'olive-green',
  'olive-teal', 'bread-orange', 'rainbow-cyan', 'rainbow-violet', 'tree-green',
  'lion-amber', 'lamb-slate', 'wave-cyan', 'moon-indigo',
];

export const DEFAULT_AVATAR_ID = 'dove-amber';

export function isValidAvatarId(id) {
  return typeof id === 'string' && AVATAR_IDS.includes(id);
}

// Resolve a client-supplied avatar_id to a valid one, falling back to the
// default when missing/invalid (signup must never block on avatar choice).
export function normalizeAvatarId(id) {
  return isValidAvatarId(id) ? id : DEFAULT_AVATAR_ID;
}
