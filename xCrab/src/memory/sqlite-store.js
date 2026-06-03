/**
 * SQLite 记忆存储实现
 */

import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

export class SQLiteStore {
  constructor(dbPath) {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this._init();
  }

  _init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT UNIQUE NOT NULL,
        value TEXT NOT NULL,
        category TEXT DEFAULT 'general',
        level TEXT DEFAULT 'mid',
        access_count INTEGER DEFAULT 0,
        created_at INTEGER DEFAULT (strftime('%s','now') * 1000),
        updated_at INTEGER DEFAULT (strftime('%s','now') * 1000)
      );
      CREATE INDEX IF NOT EXISTS idx_memories_key ON memories(key);
      CREATE INDEX IF NOT EXISTS idx_memories_level ON memories(level);
      CREATE INDEX IF NOT EXISTS idx_memories_category ON memories(category);

      CREATE TABLE IF NOT EXISTS conversation_summaries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        summary TEXT NOT NULL,
        created_at INTEGER DEFAULT (strftime('%s','now') * 1000)
      );
    `);
  }

  upsert(key, value, options = {}) {
    const { category = 'general', level = 'mid' } = options;
    const stmt = this.db.prepare(`
      INSERT INTO memories (key, value, category, level, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        category = excluded.category,
        level = excluded.level,
        updated_at = excluded.updated_at
    `);
    stmt.run(key, value, category, level, Date.now());
  }

  load(key) {
    const row = this.db.prepare('SELECT value FROM memories WHERE key = ?').get(key);
    if (row) {
      this.db.prepare('UPDATE memories SET access_count = access_count + 1 WHERE key = ?').run(key);
      return row.value;
    }
    return null;
  }

  remove(key) {
    this.db.prepare('DELETE FROM memories WHERE key = ?').run(key);
  }

  getAll() {
    return this.db.prepare('SELECT * FROM memories ORDER BY updated_at DESC').all();
  }

  search(query) {
    const pattern = `%${query}%`;
    return this.db.prepare(
      'SELECT * FROM memories WHERE key LIKE ? OR value LIKE ? ORDER BY updated_at DESC'
    ).all(pattern, pattern);
  }

  searchWithScore(query) {
    const rows = this.search(query);
    return rows.map(r => ({ ...r, relevance: 1.0 }));
  }

  getByLevel(level, limit = 100) {
    return this.db.prepare(
      'SELECT * FROM memories WHERE level = ? ORDER BY updated_at DESC LIMIT ?'
    ).all(level, limit);
  }

  exists(key) {
    const row = this.db.prepare('SELECT 1 FROM memories WHERE key = ?').get(key);
    return !!row;
  }

  saveConversationSummary(summary) {
    this.db.prepare('INSERT INTO conversation_summaries (summary) VALUES (?)').run(summary);
  }

  getRecentSummaries(limit = 5) {
    const rows = this.db.prepare(
      'SELECT summary FROM conversation_summaries ORDER BY created_at DESC LIMIT ?'
    ).all(limit);
    return rows.map(r => r.summary);
  }

  close() {
    if (this.db) {
      this.db.close();
    }
  }
}
