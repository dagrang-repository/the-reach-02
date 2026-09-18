export async function all(env, sql, ...binds) {
  const res = await env.DB.prepare(sql).bind(...binds).all();
  return res.results || [];
}

export async function one(env, sql, ...binds) {
  return env.DB.prepare(sql).bind(...binds).first();
}

export async function run(env, sql, ...binds) {
  return env.DB.prepare(sql).bind(...binds).run();
}
