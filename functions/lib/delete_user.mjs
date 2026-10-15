// Shared atomic user deletion routine.
// Enforces complete cascading deletion across all user-referencing tables,
// logs to admin_audit, and guarantees zero orphan rows.
import { uuid, nowIso } from './http.mjs';

export const USER_CHILD_TABLES = [
  'reading_progress',
  'quiz_attempts',
  'user_reading_days',
  'audio_progress',
  'notes',
  'bookmarks',
  'highlights',
  'user_badges',
  'points',
  'sessions',
  'otp_codes',
  'leaderboard_snapshots',
  'final_rank_acks',
  'final_rankings',
  'profile_pictures',
  'profile_picture_uploads',
];

/**
 * Permanently and atomically deletes a user and all child rows.
 * @param {object} db D1 database instance
 * @param {string} adminId ID of the admin performing deletion
 * @param {object} target Target user object { id, name, surname, email, role }
 * @param {string|boolean} confirm Confirmation passed by caller (true, "DELETE", or matching name/id/email)
 */
export async function deleteUserRecord(db, adminId, target, confirm) {
  if (!target || !target.id) {
    throw new Error('Target user not found');
  }

  // Rule 2: Cannot delete self or any admin account
  if (target.id === adminId) {
    throw new Error('Admins cannot delete their own account');
  }
  if (target.role === 'admin') {
    throw new Error('Admin accounts cannot be deleted');
  }

  // Rule 3: Confirmation contract
  // Supports { confirm: true }, case-insensitive "DELETE", or matching target name, id, email, full_name
  const isExplicitTrue = confirm === true || confirm === 1;
  const confNorm = String(confirm || '').trim().toLowerCase();
  const nameNorm = String(target.name || '').trim().toLowerCase();
  const idNorm = String(target.id || '').trim().toLowerCase();
  const emailNorm = String(target.email || '').trim().toLowerCase();
  const fullNameNorm = [target.name, target.surname].filter(Boolean).join(' ').trim().toLowerCase();

  const matches = isExplicitTrue || confNorm === 'true' || confNorm === 'delete' || (confNorm && (
    confNorm === nameNorm ||
    confNorm === idNorm ||
    confNorm === emailNorm ||
    confNorm === fullNameNorm
  ));

  if (!matches) {
    throw new Error('Confirmation required (confirm: true, word DELETE, or user name)');
  }

  // Prepare atomic batch of statements: all child tables, profile, and admin_audit
  const stmts = USER_CHILD_TABLES.map(t =>
    db.prepare(`DELETE FROM ${t} WHERE user_id = ?`).bind(target.id)
  );

  // Delete profile row
  stmts.push(db.prepare('DELETE FROM profiles WHERE id = ?').bind(target.id));

  // Record in admin_audit table (id, admin_id, action, target_user_id, target_display_name, created_at)
  const auditId = uuid();
  const displayName = [target.name, target.surname].filter(Boolean).join(' ').trim() || target.email || target.id;
  stmts.push(
    db.prepare(
      'INSERT INTO admin_audit (id, admin_id, action, target_user_id, target_display_name, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(auditId, adminId, 'delete_user', target.id, displayName, nowIso())
  );

  // Atomic batch execution
  await db.batch(stmts);

  return {
    ok: true,
    deleted_id: target.id,
    display_name: displayName,
    audit_id: auditId,
  };
}
