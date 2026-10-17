// GET /api/admin/notes — list Observation and Question notes for admin oversight / Leaders' inbox.
// Admin only. PRIVACY ENFORCEMENT: Prayer, Insight, and Application notes remain strictly private.
import { json, forbidden } from "../../lib/http.mjs";
import { requireUser, requireAdmin } from "../../lib/auth.mjs";

export async function onRequestGet({ request, env }) {
  const { user, response } = await requireUser(request, env);
  if (response) return response;
  if (!requireAdmin(user)) return forbidden("Admin access required");

  const url = new URL(request.url);
  const statusParam = (url.searchParams.get("status") || "").trim().toLowerCase();
  const typeParam = (url.searchParams.get("type") || "").trim().toLowerCase();
  const userId = (url.searchParams.get("userId") || "").trim();
  const day = parseInt(url.searchParams.get("day") || "0", 10);
  const q = (url.searchParams.get("q") || "").trim();
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "30", 10)));
  const offset = (page - 1) * limit;

  let whereClauses = ["li.type IN ('observation', 'question')"];
  let params = [];

  if (statusParam === "new" || statusParam === "unanswered") {
    whereClauses.push("li.status = 'new'");
  } else if (statusParam === "answered") {
    whereClauses.push("li.status = 'answered'");
  } else if (statusParam === "published") {
    whereClauses.push("li.status = 'published'");
  } else if (statusParam === "hidden") {
    whereClauses.push("li.status = 'hidden'");
  }

  if (typeParam === "observation") {
    whereClauses.push("li.type = 'observation'");
  } else if (typeParam === "question") {
    whereClauses.push("li.type = 'question'");
  }

  if (userId) {
    whereClauses.push("li.author_user_id = ?");
    params.push(userId);
  }

  if (day >= 1 && day <= 50) {
    whereClauses.push("n.day_number = ?");
    params.push(day);
  }

  if (q) {
    whereClauses.push("(li.text LIKE ? OR li.reference LIKE ? OR pr.name LIKE ? OR pr.surname LIKE ?)");
    const pattern = "%" + q + "%";
    params.push(pattern, pattern, pattern, pattern);
  }

  const whereSql = "WHERE " + whereClauses.join(" AND ");

  const countSql = `
    SELECT COUNT(*) AS total
    FROM leader_inbox li
    LEFT JOIN notes n ON n.id = li.note_id
    JOIN profiles pr ON li.author_user_id = pr.id
    ${whereSql}
  `;
  const countResult = await env.DB.prepare(countSql).bind(...params).first();
  const total = countResult?.total || 0;

  const querySql = `
    SELECT li.id, li.note_id, li.author_user_id AS user_id, li.type AS note_type,
           li.reference, li.text AS body, li.show_name, li.status,
           li.created_at, li.updated_at,
           n.book, n.chapter, n.verse, n.day_number,
           pr.name AS author_first_name, pr.surname AS author_surname,
           cr.id AS reply_id, cr.text AS reply_text, cr.admin_id AS reply_admin_id,
           cr.created_at AS reply_created_at
    FROM leader_inbox li
    LEFT JOIN notes n ON n.id = li.note_id
    JOIN profiles pr ON li.author_user_id = pr.id
    LEFT JOIN community_replies cr ON cr.inbox_id = li.id
    ${whereSql}
    ORDER BY li.created_at DESC
    LIMIT ? OFFSET ?
  `;
  const queryParams = [...params, limit, offset];
  const { results } = await env.DB.prepare(querySql).bind(...queryParams).all();

  const formattedNotes = (results || []).map(row => {
    const fullName = [row.author_first_name, row.author_surname].filter(Boolean).join(" ").trim() || row.author_first_name || "Member";
    return {
      id: row.id,
      note_id: row.note_id,
      user_id: row.user_id,
      author_full_name: fullName,
      author_name: fullName,
      type: row.note_type,
      note_type: row.note_type,
      text: row.body,
      body: row.body,
      book: row.book || row.reference?.split(" ")[0] || "",
      chapter: row.chapter || 1,
      verse: row.verse || null,
      reference: row.reference,
      day: row.day_number,
      day_number: row.day_number,
      show_name: row.show_name === 1,
      status: row.status,
      created_at: row.created_at,
      updated_at: row.updated_at,
      reply: row.reply_id ? {
        id: row.reply_id,
        text: row.reply_text,
        admin_id: row.reply_admin_id,
        created_at: row.reply_created_at
      } : null
    };
  });

  return json({
    ok: true,
    notes: formattedNotes,
    items: formattedNotes,
    page,
    limit,
    total,
    has_more: offset + formattedNotes.length < total
  });
}
