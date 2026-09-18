CREATE TABLE IF NOT EXISTS sites (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL UNIQUE,
  languages_wanted TEXT NOT NULL DEFAULT '[]',
  indexnow_key TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
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
