const path = require('path');
const fs = require('fs');

// Ensure data directory exists
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'experiment.db');

// Attempt to use native node:sqlite (Node 22.5+) with better-sqlite3 fallback
let db;
try {
  const { DatabaseSync } = require('node:sqlite');
  const syncDb = new DatabaseSync(DB_PATH);
  
  // Create wrapper interface for seamless execution
  db = {
    exec: (sql) => syncDb.exec(sql),
    prepare: (sql) => {
      const stmt = syncDb.prepare(sql);
      return {
        run: (...params) => stmt.run(...params),
        get: (...params) => stmt.get(...params),
        all: (...params) => stmt.all(...params)
      };
    }
  };
  console.log('[DB] Using native node:sqlite database at', DB_PATH);
} catch (err) {
  console.log('[DB] Falling back to better-sqlite3:', err.message);
  const Database = require('better-sqlite3');
  const bDb = new Database(DB_PATH);
  db = {
    exec: (sql) => bDb.exec(sql),
    prepare: (sql) => {
      const stmt = bDb.prepare(sql);
      return {
        run: (...params) => stmt.run(...params),
        get: (...params) => stmt.get(...params),
        all: (...params) => stmt.all(...params)
      };
    }
  };
}

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS participants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    prolific_id TEXT NOT NULL,
    study_id TEXT,
    session_id TEXT,
    condition INTEGER NOT NULL,
    status TEXT DEFAULT 'started',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME
  );

  CREATE TABLE IF NOT EXISTS survey_responses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    participant_id INTEGER NOT NULL,
    prolific_id TEXT NOT NULL,
    survey_type TEXT NOT NULL,
    answers_json TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(participant_id) REFERENCES participants(id)
  );

  CREATE TABLE IF NOT EXISTS telemetry_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    participant_id INTEGER,
    prolific_id TEXT,
    condition INTEGER,
    event_type TEXT NOT NULL,
    article_id TEXT,
    duration_ms INTEGER DEFAULT 0,
    scroll_percentage REAL DEFAULT 0,
    metadata_json TEXT,
    client_timestamp TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(participant_id) REFERENCES participants(id)
  );

  CREATE TABLE IF NOT EXISTS study_config (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`);

// Seed default study configuration
const seedConfig = (key, defaultValue) => {
  const existing = db.prepare('SELECT value FROM study_config WHERE key = ?').get(key);
  if (!existing) {
    db.prepare('INSERT INTO study_config (key, value) VALUES (?, ?)').run(key, defaultValue);
  }
};

seedConfig('min_exploration_seconds', '120'); // Minimum 2 minutes before unlocking next survey
seedConfig('prolific_completion_code', 'C19X8A9L');
seedConfig('prolific_completion_url', 'https://app.prolific.com/submissions/complete?cc=C19X8A9L');

/**
 * Assigns a condition (1, 2, or 3) using balanced minimum-count allocation.
 * Finds the condition with the fewest participants. In case of tie, picks randomly.
 */
function getBalancedCondition() {
  const counts = { 1: 0, 2: 0, 3: 0 };
  
  // Count participants in each condition
  const rows = db.prepare(`
    SELECT condition, COUNT(*) as count 
    FROM participants 
    GROUP BY condition
  `).all();

  rows.forEach(r => {
    if (counts[r.condition] !== undefined) {
      counts[r.condition] = Number(r.count);
    }
  });

  const minCount = Math.min(counts[1], counts[2], counts[3]);
  const candidateConditions = [1, 2, 3].filter(c => counts[c] === minCount);

  // Tie-breaking: pick uniformly at random among min count conditions
  const selectedCondition = candidateConditions[Math.floor(Math.random() * candidateConditions.length)];
  return selectedCondition;
}

/**
 * Initializes or fetches existing participant by Prolific ID
 */
function getOrCreateParticipant(prolificId, studyId = '', sessionId = '') {
  if (!prolificId) {
    throw new Error('prolific_id is required');
  }

  // Check if participant already exists
  const existing = db.prepare(`
    SELECT * FROM participants 
    WHERE prolific_id = ? 
    ORDER BY id DESC LIMIT 1
  `).get(prolificId);

  if (existing) {
    return existing;
  }

  // Assign condition with balanced randomization
  const condition = getBalancedCondition();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO participants (prolific_id, study_id, session_id, condition, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'consented', ?, ?)
  `).run(prolificId, studyId, sessionId, condition, now, now);

  return db.prepare(`SELECT * FROM participants WHERE prolific_id = ? ORDER BY id DESC LIMIT 1`).get(prolificId);
}

/**
 * Updates participant status (e.g. 'pre_survey_done', 'exploring', 'post_survey_done', 'completed')
 */
function updateParticipantStatus(participantId, status) {
  const isCompleted = status === 'completed';
  const now = new Date().toISOString();
  if (isCompleted) {
    db.prepare(`
      UPDATE participants 
      SET status = ?, completed_at = ?, updated_at = ? 
      WHERE id = ?
    `).run(status, now, now, participantId);
  } else {
    db.prepare(`
      UPDATE participants 
      SET status = ?, updated_at = ? 
      WHERE id = ?
    `).run(status, now, participantId);
  }
}

/**
 * Stores survey response (pre or post)
 */
function saveSurveyResponse(participantId, prolificId, surveyType, answers) {
  const jsonStr = typeof answers === 'string' ? answers : JSON.stringify(answers);
  db.prepare(`
    INSERT INTO survey_responses (participant_id, prolific_id, survey_type, answers_json)
    VALUES (?, ?, ?, ?)
  `).run(participantId, prolificId, surveyType, jsonStr);
}

/**
 * Logs telemetry events (clicks, dwells, scroll, explanations, etc.)
 */
function logTelemetryEvent(data) {
  const {
    participant_id,
    prolific_id,
    condition,
    event_type,
    article_id = null,
    duration_ms = 0,
    scroll_percentage = 0,
    metadata = {},
    client_timestamp = new Date().toISOString()
  } = data;

  const metadataStr = typeof metadata === 'string' ? metadata : JSON.stringify(metadata);

  db.prepare(`
    INSERT INTO telemetry_events (
      participant_id, prolific_id, condition, event_type, article_id, 
      duration_ms, scroll_percentage, metadata_json, client_timestamp
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    participant_id || null,
    prolific_id || null,
    condition || null,
    event_type,
    article_id,
    duration_ms,
    scroll_percentage,
    metadataStr,
    client_timestamp
  );
}

/**
 * Returns configuration value
 */
function getConfig(key) {
  const row = db.prepare('SELECT value FROM study_config WHERE key = ?').get(key);
  return row ? row.value : null;
}

/**
 * Admin Stats Summary
 */
function getAdminStats() {
  const conditionStats = db.prepare(`
    SELECT 
      condition, 
      COUNT(*) as total_participants,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_count
    FROM participants
    GROUP BY condition
  `).all();

  const totalEvents = db.prepare(`SELECT COUNT(*) as count FROM telemetry_events`).get().count;
  const totalSurveys = db.prepare(`SELECT COUNT(*) as count FROM survey_responses`).get().count;
  const recentParticipants = db.prepare(`
    SELECT * FROM participants ORDER BY created_at DESC LIMIT 50
  `).all();

  // Aggregate reading time per article per condition
  const articleEngagement = db.prepare(`
    SELECT 
      article_id,
      condition,
      COUNT(CASE WHEN event_type = 'article_click' THEN 1 END) as total_clicks,
      SUM(CASE WHEN event_type = 'article_dwell' THEN duration_ms ELSE 0 END) as total_dwell_ms,
      AVG(CASE WHEN event_type = 'article_scroll' THEN scroll_percentage ELSE NULL END) as avg_scroll_percentage
    FROM telemetry_events
    WHERE article_id IS NOT NULL
    GROUP BY article_id, condition
  `).all();

  return {
    conditionStats,
    totalEvents: Number(totalEvents),
    totalSurveys: Number(totalSurveys),
    recentParticipants,
    articleEngagement,
    config: {
      min_exploration_seconds: getConfig('min_exploration_seconds'),
      prolific_completion_code: getConfig('prolific_completion_code'),
      prolific_completion_url: getConfig('prolific_completion_url')
    }
  };
}

/**
 * Raw Export for Data Analysis (Participants, Surveys, Telemetry)
 */
function getAllDataForExport() {
  const participants = db.prepare('SELECT * FROM participants ORDER BY id ASC').all();
  const surveys = db.prepare('SELECT * FROM survey_responses ORDER BY id ASC').all();
  const events = db.prepare('SELECT * FROM telemetry_events ORDER BY id ASC').all();

  return { participants, surveys, events };
}

module.exports = {
  db,
  getOrCreateParticipant,
  updateParticipantStatus,
  saveSurveyResponse,
  logTelemetryEvent,
  getConfig,
  getAdminStats,
  getAllDataForExport
};
