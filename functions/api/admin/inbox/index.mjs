// GET /api/admin/inbox — Leaders' inbox: list and filter observation/question submissions.
// Admin only. Shows real author identity, status, history, and community replies.
import { json, forbidden } from '../../../lib/http.mjs';
import { requireUser, requireAdmin } from '../../../lib/auth.mjs';

export async function onRequestGet({ request, env }) {
  const { user, response } = await requireUser(request, env);
  if (response) return response;
  if (!requireAdmin(user)) return forbidden('Admin access required');

  const url = new URL(request.url);
  const statusParam = (url.searchParams.get('status') || 'all').trim().toLowerCase();
  const typeParam = (url.searchParams.get('type') || '').trim().toLowerCase();
  const userId = (url.searchParams.get('userId') || '').trim();
  const q = (url.searchParams.get('q') || '').trim();
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '30', 10)));
  const offset = (page - 1) * limit;

  let whereClauses = ["li.type IN ('observation', 'question')"];
  let params = [];

  if (statusParam === 'new' || statusParam === 'unanswered') {
    whereClauses.push("li.status = 'new'");
  } else if (statusParam === 'answered') {
    whereClauses.push("li.status = 'answered'");
  } else if (statusParam === 'published') {
    whereClauses.push("li.status = 'published'");
  } else if (statusParam === 'hidden') {
    whereClauses.push("li.status = 'hidden'");
  }

  if (typeParam === 'observation' || typeParam === 'question') {
    whereClauses.push("li.type = ?");
    params.push(typeParam);
  }

  if (userId) {
    whereClauses.push("li.author_user_id = ?");
    params.push(userId);
  }

  if (q) {
    whereClauses.push("(li.text LIKE ? OR li.reference LIKE ? OR pr.name LIKE ? OR pr.surname LIKE ?)");
    const pattern = `%${q}%`;
    params.push(pattern, pattern, pattern, pattern);
  }

  const whereSql = "WHERE " + whereClauses.join(" AND ");

  const countSql = `
    SELECT COUNT(*) AS total
    FROM leader_inbox li
    LEFT JOIN profiles pr ON pr.id = li.author_user_id
    ${whereSql}
  `;
  const countRow = await env.DB.prepare(countSql).bind(...params).first();
  const total = countRow?.total || 0;

  const querySql = `
    SELECT li.id, li.note_id, li.author_user_id, li.type, li.reference, li.text,
           li.show_name, li.status, li.created_at, li.updated_at,
           pr.name AS author_first_name, pr.surname AS author_surname, pr.email AS author_email,
           cr.id AS reply_id, cr.text AS reply_text, cr.admin_id AS reply_admin_id,
           cr.created_at AS reply_created_at, cr.updated_at AS reply_updated_at,
           (SELECT COUNT(*) FROM leader_inbox_versions liv WHERE liv.inbox_id = li.id) AS version_count
    FROM leader_inbox li
    LEFT JOIN profiles pr ON pr.id = li.author_user_id
    LEFT JOIN community_replies cr ON cr.inbox_id = li.id
    ${whereSql}
    ORDER BY li.created_at DESC
    LIMIT ? OFFSET ?
  `;
  const queryParams = [...params, limit, offset];
  const { results } = await env.DB.prepare(querySql).bind(...queryParams).all();

  const items = (results || []).map(row => {
    const fullName = [row.author_first_name, row.author_surname].filter(Boolean).join(' ').trim() || row.author_first_name || 'Member';
    return {
      id: row.id,
      note_id: row.note_id,
      author_user_id: row.author_user_id,
      author_full_name: fullName,
      author_email: row.author_email,
      type: row.type,
      reference: row.reference,
      text: row.text,
      show_name: row.show_name === 1,
      status: row.status,
      created_at: row.created_at,
      updated_at: row.updated_at,
      version_count: row.version_count || 0,
      reply: row.reply_id ? {
        id: row.reply_id,
        text: row.reply_text,
        admin_id: row.reply_admin_id,
        created_at: row.reply_created_at,
        updated_at: row.reply_updated_at
      } : null
    };
  });

  return json({
    ok: true,
    items,
    page,
    limit,
    total,
    has_more: offset + items.length < total
  });
}
