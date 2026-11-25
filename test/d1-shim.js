/* A D1-shaped database over Node's built-in SQLite, so the Worker's fetch handler can be called in-process:
   env.DB.prepare(sql).bind(...).all() / .first() / .run(), and env.DB.batch([...]). Test-only. */
import { readFileSync } from "node:fs";

export async function openDb(schemaPath) {
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(":memory:");
  if (schemaPath) db.exec(readFileSync(schemaPath, "utf8"));
  const clean = (v) => (v === undefined ? null : typeof v === "boolean" ? (v ? 1 : 0) : v);
  const stmt = (sql, binds = []) => ({
    bind: (...b) => stmt(sql, b),
    async all() {
      return { results: db.prepare(sql).all(...binds.map(clean)).map((r) => ({ ...r })), success: true };
    },
    async first(col) {
      const row = db.prepare(sql).get(...binds.map(clean));
      if (!row) return null;
      return col ? row[col] : { ...row };
    },
    async run() {
      const r = db.prepare(sql).run(...binds.map(clean));
      return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
    },
  });
  return {
    prepare: (sql) => stmt(sql),
    async batch(list) {
      const out = [];
      for (const s of list) out.push(await s.run());
      return out;
    },
    exec: async (sql) => db.exec(sql),
    raw: db,
  };
}
