import { listSiteDoors } from "./stack.js";

export async function sweepDoors(env) {
  const listed = env ? await listSiteDoors(env) : [];
  const sites = [];
  for (const row of listed) {
    const doors = [];
    for (const door of (row.doors || []).slice(0, 12)) {
      try {
        const res = await fetch(door.there, {
          headers: { "user-agent": "TheReach02-doors/1.1" },
          redirect: "follow",
        });
        doors.push({ ...door, status: res.status, open: res.ok });
      } catch (err) {
        doors.push({ ...door, status: 0, open: false, error: String(err.message || err) });
      }
    }
    sites.push({ site: row.site, url: row.url, doors, all_open: doors.every((d) => d.open) });
  }
  return { checked_at: new Date().toISOString(), sites };
}
