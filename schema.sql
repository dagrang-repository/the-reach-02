CREATE TABLE IF NOT EXISTS sites (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL UNIQUE,
  languages_wanted TEXT NOT NULL DEFAULT '[]',
  indexnow_key TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  sitemap_url TEXT,
  llms_url TEXT,
  description TEXT,
  og_image TEXT,
  jsonld_types TEXT,
  languages_count INTEGER,
  feed_url TEXT,
  capture_json TEXT,
  overrides_json TEXT,
  captured_at TEXT,
  i18n_json TEXT,
  door_n INTEGER,
  checked_at TEXT,
  attempt_status INTEGER,
  failed_attempts INTEGER,
  stale_since TEXT,
  record_hash TEXT,
  same_as_json TEXT,
  links_to_hub_json TEXT
);

-- door_n is permanent and never reused: src/hill.js ensureDoorNumbers backfills it once, numbers every new row and
-- creates the unique index idx_sites_door_n itself (here it would fail on a database whose sites table predates door_n)

-- the one liveness resolver (src/liveness.js): one row per door, written by the sweep, the hourly home probe,
-- the capture, the ping rotation and the key check; a door with no row is 'unverified'
CREATE TABLE IF NOT EXISTS door_status (
  site_id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  http_status INTEGER,
  last_verified TEXT,
  last_ok_at TEXT,
  first_fail_at TEXT,
  closed_since TEXT,
  fails INTEGER NOT NULL DEFAULT 0,
  source TEXT,
  key_ok INTEGER,
  key_verified_at TEXT
);

CREATE TABLE IF NOT EXISTS briefings (
  site_id TEXT PRIMARY KEY,
  category TEXT,
  services_json TEXT NOT NULL DEFAULT '[]',
  languages_present TEXT NOT NULL DEFAULT '[]',
  languages_target TEXT NOT NULL DEFAULT '[]',
  summary TEXT,
  punch_line TEXT,
  value_bring TEXT,
  who_for TEXT,
  angles_json TEXT NOT NULL DEFAULT '[]',
  raw_excerpt TEXT,
  model TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (site_id) REFERENCES sites(id)
);

CREATE TABLE IF NOT EXISTS packs (
  site_id TEXT PRIMARY KEY,
  keywords_json TEXT NOT NULL DEFAULT '{}',
  structure_md TEXT NOT NULL DEFAULT '',
  doors_json TEXT NOT NULL DEFAULT '[]',
  files_json TEXT NOT NULL DEFAULT '{}',
  probe_json TEXT NOT NULL DEFAULT '[]',
  features_json TEXT NOT NULL DEFAULT '[]',
  ping_urls_json TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL,
  FOREIGN KEY (site_id) REFERENCES sites(id)
);

CREATE TABLE IF NOT EXISTS reach_map (
  id TEXT PRIMARY KEY,
  sitemap_xml TEXT NOT NULL DEFAULT '',
  llms_txt TEXT NOT NULL DEFAULT '',
  structure_md TEXT NOT NULL DEFAULT '',
  doors_json TEXT NOT NULL DEFAULT '[]',
  sites_json TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS channels (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  config_json TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

INSERT OR IGNORE INTO channels (id, type, name, config_json, active, created_at)
VALUES ('ch_answer', 'answer_engine', 'Answer engines', '{}', 1, '2026-09-18T00:00:00.000Z');

CREATE TABLE IF NOT EXISTS recipients (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  locale TEXT,
  opted_in INTEGER NOT NULL DEFAULT 0,
  opted_in_at TEXT,
  unsubscribed_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS targets (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  angle_id TEXT NOT NULL,
  locale TEXT NOT NULL DEFAULT 'en',
  label TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (site_id, channel_id, angle_id, locale),
  FOREIGN KEY (site_id) REFERENCES sites(id),
  FOREIGN KEY (channel_id) REFERENCES channels(id)
);

CREATE TABLE IF NOT EXISTS ledger (
  id TEXT PRIMARY KEY,
  target_id TEXT NOT NULL UNIQUE,
  site_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  angle_id TEXT NOT NULL,
  locale TEXT,
  packet_hash TEXT,
  result TEXT NOT NULL,
  detail TEXT,
  sent_at TEXT NOT NULL,
  FOREIGN KEY (target_id) REFERENCES targets(id)
);

CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  trigger TEXT NOT NULL,
  ok INTEGER NOT NULL DEFAULT 0,
  attempted INTEGER NOT NULL DEFAULT 0,
  delivered INTEGER NOT NULL DEFAULT 0,
  skipped INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  detail TEXT
);

CREATE TABLE IF NOT EXISTS outbox (
  id TEXT PRIMARY KEY,
  run_id TEXT,
  target_id TEXT,
  channel_type TEXT,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pings (
  id TEXT PRIMARY KEY,
  run_id TEXT,
  site_id TEXT,
  kind TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  url TEXT,
  status INTEGER,
  ok INTEGER NOT NULL DEFAULT 0,
  detail TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_targets_site ON targets(site_id);
CREATE INDEX IF NOT EXISTS idx_ledger_site ON ledger(site_id);
CREATE INDEX IF NOT EXISTS idx_runs_started ON runs(started_at);
CREATE INDEX IF NOT EXISTS idx_pings_site ON pings(site_id);
CREATE INDEX IF NOT EXISTS idx_pings_run ON pings(run_id);

CREATE TABLE IF NOT EXISTS changes (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  kind TEXT NOT NULL,
  site_id TEXT,
  url TEXT,
  detail TEXT
);

CREATE TABLE IF NOT EXISTS door_state (
  url TEXT PRIMARY KEY,
  body_hash TEXT,
  last_ping_at TEXT,
  last_ok_at TEXT,
  last_status INTEGER
);

-- each origin's own sitemap URLs as last read by the hub (src/origin-urls.js): the IndexNow deltas for every
-- citable page of the network, and the dated entries of each site's pack feed
CREATE TABLE IF NOT EXISTS origin_urls (
  site_id TEXT NOT NULL,
  url TEXT NOT NULL,
  lastmod TEXT,
  seen_at TEXT,
  pinged_lastmod TEXT,
  pinged_at TEXT,
  PRIMARY KEY (site_id, url)
);

-- inbox (src/inbox.js, self-creating): Email Routing -> peerpush@aplusz.app -> this Worker. One row per accepted
-- PeerPush mail (code or notice), per refused sender (service 'rejected', kept 2 days) and per bot announcement
-- (service 'expect:peerpush'). Kept 30 days. Codes are handed out once, never listed, never public.
CREATE TABLE IF NOT EXISTS inbox (
  id TEXT PRIMARY KEY,
  service TEXT NOT NULL,
  received_at TEXT NOT NULL,
  from_addr TEXT,
  subject TEXT,
  code TEXT,
  used_at TEXT,
  snippet TEXT
);
