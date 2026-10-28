// Scripts CRUD operations - save/load user Pine Scripts from SQLite

import { getDb } from '../db/database.js';
import type { SavedScript } from '../types/index.js';
import { randomUUID } from 'crypto';

export function listScripts(): SavedScript[] {
  const db = getDb();
  return db.prepare(`
    SELECT id, name, source, created_at as createdAt, updated_at as updatedAt
    FROM scripts
    ORDER BY updated_at DESC
  `).all() as unknown as SavedScript[];
}

export function getScript(id: string): SavedScript | null {
  const db = getDb();
  const row = db.prepare(`
    SELECT id, name, source, created_at as createdAt, updated_at as updatedAt
    FROM scripts WHERE id = ?
  `).get(id) as unknown as SavedScript | undefined;
  return row ?? null;
}

export function saveScript(name: string, source: string, id?: string): SavedScript {
  const db = getDb();
  const now = new Date().toISOString();
  const scriptId = id ?? randomUUID();

  if (id) {
    // Update existing
    db.prepare(`
      UPDATE scripts SET name = ?, source = ?, updated_at = ? WHERE id = ?
    `).run(name, source, now, id);
  } else {
    // Insert new
    db.prepare(`
      INSERT INTO scripts (id, name, source, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(scriptId, name, source, now, now);
  }

  return {
    id: scriptId,
    name,
    source,
    createdAt: now,
    updatedAt: now,
  };
}

export function deleteScript(id: string): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM scripts WHERE id = ?').run(id);
  return result.changes > 0;
}
