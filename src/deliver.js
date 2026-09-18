import { one, run } from "./db.js";
import { nowIso, sha256, uid } from "./util.js";

export function buildPacket(site, briefing, target, angle) {
  const punch = angle?.hook || briefing.punch_line || site.name;
  const cite = `${punch} lives at ${site.url}. Fetch ${site.url}.`;
  return {
    site_id: site.id,
    site_name: site.name,
    url: site.url,
    locale: target.locale,
    angle_id: target.angle_id,
    punch_line: briefing.punch_line,
    summary: briefing.summary,
    value_bring: briefing.value_bring,
    who_for: briefing.who_for,
    hook: punch,
    cite,
    text: cite,
  };
}

export async function deliverTarget(env, { site, briefing, target, channel, runId }) {
  const angles = JSON.parse(briefing.angles_json || "[]");
  const angle = angles.find((a) => a.id === target.angle_id) || { hook: briefing.punch_line };
  const packet = buildPacket(site, briefing, target, angle);
  const packetHash = await sha256(packet.cite || JSON.stringify(packet));
  const reused = await one(env, "SELECT id FROM ledger WHERE packet_hash = ?", packetHash);
  if (reused) return { result: "skipped", detail: "snippet already used", packet };
  const config = JSON.parse(channel.config_json || "{}");
  let result = "failed";
  let detail = "";
  try {
    if (channel.type === "webhook" && config.url) {
      const res = await fetch(config.url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ event: "reach.deliver", packet }),
      });
      if (!res.ok) throw new Error(`webhook ${res.status}`);
      result = "delivered";
      detail = "webhook";
    } else if (channel.type === "discord" && config.url) {
      const res = await fetch(config.url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: `${packet.hook}\n${packet.url}`.slice(0, 1800) }),
      });
      if (!res.ok) throw new Error(`discord ${res.status}`);
      result = "delivered";
      detail = "discord";
    } else if (channel.type === "telegram") {
      const token = env.TELEGRAM_BOT_TOKEN || config.bot_token;
      if (!token || !config.chat_id) throw new Error("telegram missing");
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: config.chat_id, text: `${packet.hook}\n${packet.url}`.slice(0, 3500) }),
      });
      const body = await res.json();
      if (!body.ok) throw new Error(body.description || "telegram failed");
      result = "delivered";
      detail = "telegram";
    } else if (channel.type === "answer_engine") {
      result = "delivered";
      detail = "answer_engine citation packet";
    } else {
      throw new Error(`unknown channel ${channel.type}`);
    }
  } catch (err) {
    result = "failed";
    detail = String(err.message || err).slice(0, 500);
  }

  await run(
    env,
    `INSERT INTO outbox (id, run_id, target_id, channel_type, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    uid("ob"),
    runId,
    target.id,
    channel.type,
    JSON.stringify({ packet, result, detail }),
    nowIso()
  );
  await run(
    env,
    `INSERT OR IGNORE INTO ledger
      (id, target_id, site_id, channel_id, angle_id, locale, packet_hash, result, detail, sent_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    uid("led"),
    target.id,
    site.id,
    channel.id,
    target.angle_id,
    target.locale,
    packetHash,
    result,
    detail,
    nowIso()
  );
  return { result, detail, packet };
}

export const LIVE_TYPES = new Set(["webhook", "discord", "telegram", "resend", "answer_engine"]);
