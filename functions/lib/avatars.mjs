// Illustration avatar ids — the single source of truth on the backend.
// (pwa_and_avatars_v1 Part B: replaces the old inline-SVG "{icon}-{color}"
// preset set.) Each id maps to a square illustration PNG committed at
// public/avatars/{id}.png (41 scene/subject illustrations fetched from the
// operator's Drive folder; see BUILD_STATE.json pwa_and_avatars_v1). These
// MUST match the ids in public/app.js (FH.AVATARS) and the files on disk.
// Used to validate avatar selection and to default avatar_id at signup.

export const AVATAR_IDS = [
  'avatar-01', 'avatar-02', 'avatar-03', 'avatar-04', 'avatar-05',
  'avatar-06', 'avatar-07', 'avatar-08', 'avatar-09', 'avatar-10',
  'avatar-11', 'avatar-12', 'avatar-13', 'avatar-14', 'avatar-15',
  'avatar-16', 'avatar-17', 'avatar-18', 'avatar-19', 'avatar-20',
  'avatar-21', 'avatar-22', 'avatar-23', 'avatar-24', 'avatar-25',
  'avatar-26', 'avatar-27', 'avatar-28', 'avatar-29', 'avatar-30',
  'avatar-31', 'avatar-32', 'avatar-33', 'avatar-34', 'avatar-35',
  'avatar-36', 'avatar-37', 'avatar-38', 'avatar-39', 'avatar-40',
  'avatar-41',
];

export const DEFAULT_AVATAR_ID = 'avatar-01';

export function isValidAvatarId(id) {
  return typeof id === 'string' && AVATAR_IDS.includes(id);
}

// Resolve a client-supplied avatar_id to a valid one, falling back to the
// default when missing/invalid (signup must never block on avatar choice).
export function normalizeAvatarId(id) {
  return isValidAvatarId(id) ? id : DEFAULT_AVATAR_ID;
}
