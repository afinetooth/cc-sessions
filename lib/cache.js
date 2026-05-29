'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');

// Origin persistence cache. The registry's `entrypoint` is a LIVENESS signal — it exists
// only while a session's process is running, and vanishes when the session is closed
// (it was never written into the transcript). To keep origin after a session closes, we
// snapshot it here while the process is still alive: a write-through cache mapping
// sessionId -> { origin, entrypoint, seenAt }. On later runs, a now-closed session can
// recover its last-known origin from this file.
//
// Honest limit: this can only remember sessions cc-sessions observed WHILE THEY WERE LIVE.
// Sessions closed before cc-sessions ever ran fall back to the transcript fingerprint or "—".

const CACHE_FILE =
  process.env.CC_SESSIONS_CACHE ||
  path.join(os.homedir(), '.config', 'cc-sessions', 'origins.json');

function loadCache() {
  try {
    const o = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    return o && typeof o === 'object' && !Array.isArray(o) ? o : {};
  } catch {
    return {};
  }
}

function saveCache(map) {
  try {
    fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(map, null, 2));
  } catch {}
}

module.exports = { loadCache, saveCache, CACHE_FILE };
