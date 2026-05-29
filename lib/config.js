'use strict';
const os = require('os');
const path = require('path');

// Where Claude Code keeps its data. Claude Code itself honors $CLAUDE_CONFIG_DIR;
// we follow the same override so the tool works for non-default installs and so the
// test suite can point at fixtures. Falls back to ~/.claude.
const HOME = os.homedir();
const BASE_DIR = process.env.CLAUDE_CONFIG_DIR || path.join(HOME, '.claude');
const PROJECTS_DIR = path.join(BASE_DIR, 'projects');
const SESSIONS_DIR = path.join(BASE_DIR, 'sessions');
const HTML_PATH = path.join(BASE_DIR, 'cc-sessions.html');

module.exports = { HOME, BASE_DIR, PROJECTS_DIR, SESSIONS_DIR, HTML_PATH };
