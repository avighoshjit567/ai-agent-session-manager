import type Database from 'better-sqlite3';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { getDb } from './db.js';
import { PATHS, ensureAppDirs } from './paths.js';
import type { TaskImage } from '../../shared/types.js';

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

export const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
};

export function imageFilePath(filename: string, dir: string = PATHS.taskImagesDir): string {
  return path.join(dir, filename);
}

// Filenames are server-generated, but validate anyway so the serving route can
// never be walked out of the images directory.
export function isSafeImageFilename(name: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]*\.(png|jpg|gif|webp)$/.test(name) && !name.includes('..');
}

function rowToImage(r: any): TaskImage {
  return {
    id: r.id,
    taskId: r.taskId,
    url: `/api/task-images/${r.filename}`,
    filename: r.filename,
    originalName: r.originalName ?? null,
    size: r.size,
    createdAt: r.createdAt,
  };
}

const IMAGE_SELECT = `
  SELECT id, task_id AS taskId, filename, original_name AS originalName, size,
         created_at AS createdAt
  FROM task_images`;

export function listTaskImages(taskId: number, db: Database.Database = getDb()): TaskImage[] {
  const rows = db.prepare(`${IMAGE_SELECT} WHERE task_id = ? ORDER BY id`).all(taskId) as any[];
  return rows.map(rowToImage);
}

export function imagesByTask(
  db: Database.Database,
  taskIds: number[],
): Map<number, TaskImage[]> {
  const map = new Map<number, TaskImage[]>();
  if (taskIds.length === 0) return map;
  const placeholders = taskIds.map(() => '?').join(',');
  const rows = db
    .prepare(`${IMAGE_SELECT} WHERE task_id IN (${placeholders}) ORDER BY id`)
    .all(...taskIds) as any[];
  for (const r of rows) {
    const list = map.get(r.taskId) ?? [];
    list.push(rowToImage(r));
    map.set(r.taskId, list);
  }
  return map;
}

export function addTaskImage(
  taskId: number,
  dataUrl: string,
  originalName: string | null,
  db: Database.Database = getDb(),
  dir: string = PATHS.taskImagesDir,
): TaskImage | null {
  const task = db.prepare(`SELECT id FROM tasks WHERE id = ?`).get(taskId);
  if (!task) return null;

  const m = /^data:(image\/(?:png|jpeg|gif|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl ?? '');
  if (!m) throw new Error('Expected a base64 data URL of an image (png, jpeg, gif, or webp)');
  const mime = m[1];
  // 4 base64 chars ≈ 3 bytes; cheap pre-check before decoding a huge payload.
  if (m[2].length > (MAX_IMAGE_BYTES / 3) * 4 + 4) {
    throw new Error(`Image too large (max ${MAX_IMAGE_BYTES / 1024 / 1024}MB)`);
  }
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length === 0) throw new Error('Empty image');
  if (buf.length > MAX_IMAGE_BYTES) {
    throw new Error(`Image too large (max ${MAX_IMAGE_BYTES / 1024 / 1024}MB)`);
  }

  if (dir === PATHS.taskImagesDir) ensureAppDirs();
  const filename = `${taskId}-${crypto.randomBytes(8).toString('hex')}.${EXT_BY_MIME[mime]}`;
  fs.writeFileSync(imageFilePath(filename, dir), buf);

  const res = db
    .prepare(
      `INSERT INTO task_images (task_id, filename, original_name, size, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(taskId, filename, originalName ?? null, buf.length, new Date().toISOString());
  const row = db.prepare(`${IMAGE_SELECT} WHERE id = ?`).get(Number(res.lastInsertRowid)) as any;
  return rowToImage(row);
}

export function deleteTaskImage(
  imageId: number,
  db: Database.Database = getDb(),
  dir: string = PATHS.taskImagesDir,
): boolean {
  const row = db.prepare(`SELECT filename FROM task_images WHERE id = ?`).get(imageId) as any;
  if (!row) return false;
  db.prepare(`DELETE FROM task_images WHERE id = ?`).run(imageId);
  try {
    fs.unlinkSync(imageFilePath(row.filename, dir));
  } catch {
    // DB row is authoritative; a missing file is fine.
  }
  return true;
}

export function deleteImagesForTask(
  taskId: number,
  db: Database.Database = getDb(),
  dir: string = PATHS.taskImagesDir,
): void {
  const rows = db.prepare(`SELECT filename FROM task_images WHERE task_id = ?`).all(taskId) as any[];
  db.prepare(`DELETE FROM task_images WHERE task_id = ?`).run(taskId);
  for (const r of rows) {
    try {
      fs.unlinkSync(imageFilePath(r.filename, dir));
    } catch {
      // ignore missing files
    }
  }
}
