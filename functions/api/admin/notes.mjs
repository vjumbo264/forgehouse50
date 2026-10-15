// GET /api/admin/notes — list Observation and Question notes for admin oversight.
// Admin only. PRIVACY ENFORCEMENT: Prayer, Insight, and Application notes remain strictly private
// and are NEVER returned by this endpoint or any admin API.

import { json, forbidden } from "../../lib/http.mjs";
import { requireUser, requireAdmin } from "../../lib/auth.mjs";

const ALLOWED_ADMIN_NOTE_TYPES = ["observation", "question"];

export async function onRequestGet({ request, env }) {
  const { user, response } = await requireUser(request, env);
  if (response) return response;
  if (!requireAdmin(user)) return forbidden("Admin access required");

  const url = new URL(request.url);
  const typeParam = (url.searchParams.get("type") || "").trim().toLowerCase();
  const userId = (url.searchParams.get("userId") || "").trim();
  const day = parseInt(url.searchParams.get("day") || "0", 10);
  const q = (url.searchParams.get("q") || "").trim();
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "25", 10)));
  const offset = (page - 1) * limit;

  // Build WHERE clause with strict server-side note type restriction.
  // NEVER allow types other than observation and question under any circumstance.
  let whereClauses = [];
  let params = [];

  if (typeParam === "observation") {
    whereClauses.push("n.note_type = 'observation'");
  } else if (typeParam === "question") {
    whereClauses.push("n.note_type = 'question'");
  } else {
    // Default and "all-visible": only observation and question
    whereClauses.push("n.note_type IN ('observation', 'question')");
  }

  if (userId) {
    whereClauses.push("n.user_id = ?");
    params.push(userId);
  }

  if (day >= 1 && day <= 50) {
    whereClauses.push("n.day_number = ?");
    params.push(day);
  }

  if (q) {
    whereClauses.push("(n.body LIKE ? OR n.book LIKE ?)");
    params.push("%" + q + "%");
    params.push("%" + q + "%");
  }

  const whereSql = whereClauses.length > 0 ? "WHERE " + whereClauses.join(" AND ") : "";

  // Get total count
  const countSql = `
    SELECT COUNT(*) AS total
    FROM notes n
    JOIN profiles pr ON n.user_id = pr.id
    ` + whereSql;
  const countResult = await env.DB.prepare(countSql).bind(...params).first();
  const total = countResult?.total || 0;

  // Query paginated notes
  const querySql = `
    SELECT n.id, n.user_id, n.note_type, n.body, n.book, n.chapter, n.verse, n.day_number,
           n.created_at, n.updated_at,
           pr.name AS author_first_name, pr.surname AS author_surname
    FROM notes n
    JOIN profiles pr ON n.user_id = pr.id
    ` + whereSql + `
    ORDER BY n.created_at DESC
    LIMIT ? OFFSET ?
  `;

  const queryParams = [...params, limit, offset];
  const { results } = await env.DB.prepare(querySql).bind(...queryParams).all();

  const formattedNotes = (results || []).map(row => {
    const fullName = [row.author_first_name, row.author_surname].filter(Boolean).join(" ").trim() || row.author_first_name || "Member";
    const reference = `${row.book} ${row.chapter}${row.verse ? ":" + row.verse : ""}`.trim();
    return {
      id: row.id,
      user_id: row.user_id,
      author_full_name: fullName,
      author_name: fullName,
      type: row.note_type,
      note_type: row.note_type,
      text: row.body,
      body: row.body,
      book: row.book,
      chapter: row.chapter,
      verse: row.verse,
      reference: reference,
      day: row.day_number,
      day_number: row.day_number,
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  });

  return json({
    ok: true,
    notes: formattedNotes,
    page,
    limit,
    total,
    has_more: offset + formattedNotes.length < total
  });
}
