import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { initSchema } from '../src/db';
import { createTask, deleteTask, getTask } from '../src/tasks';
import {
  addTaskImage,
  deleteTaskImage,
  listTaskImages,
  imageFilePath,
  MAX_IMAGE_BYTES,
} from '../src/taskImages';

// 1x1 transparent PNG
const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const PNG_DATA_URL = `data:image/png;base64,${PNG_B64}`;

function fresh(): { db: Database.Database; dir: string } {
  const db = new Database(':memory:');
  initSchema(db);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'task-images-'));
  return { db, dir };
}

describe('addTaskImage', () => {
  it('stores the file on disk and returns metadata with a served url', () => {
    const { db, dir } = fresh();
    const t = createTask({ title: 'A' }, db);
    const img = addTaskImage(t.id, PNG_DATA_URL, 'shot.png', db, dir);
    expect(img).not.toBeNull();
    expect(img!.taskId).toBe(t.id);
    expect(img!.originalName).toBe('shot.png');
    expect(img!.url).toMatch(/^\/api\/task-images\/.+\.png$/);
    const stored = imageFilePath(img!.filename, dir);
    expect(fs.existsSync(stored)).toBe(true);
    expect(fs.readFileSync(stored).length).toBe(img!.size);
  });

  it('returns null for a missing task', () => {
    const { db, dir } = fresh();
    expect(addTaskImage(999, PNG_DATA_URL, 'x.png', db, dir)).toBeNull();
  });

  it('rejects non-image data URLs', () => {
    const { db, dir } = fresh();
    const t = createTask({ title: 'A' }, db);
    expect(() => addTaskImage(t.id, 'data:text/html;base64,PGI+', 'x.html', db, dir)).toThrow(/image/i);
    expect(() => addTaskImage(t.id, 'not a data url', 'x.png', db, dir)).toThrow(/image/i);
  });

  it('rejects oversized images', () => {
    const { db, dir } = fresh();
    const t = createTask({ title: 'A' }, db);
    const big = 'data:image/png;base64,' + 'A'.repeat(Math.ceil((MAX_IMAGE_BYTES + 10) / 3) * 4);
    expect(() => addTaskImage(t.id, big, 'big.png', db, dir)).toThrow(/large/i);
  });
});

describe('listing and task integration', () => {
  it('lists images for a task and includes them on getTask', () => {
    const { db, dir } = fresh();
    const t = createTask({ title: 'A' }, db);
    addTaskImage(t.id, PNG_DATA_URL, 'one.png', db, dir);
    addTaskImage(t.id, PNG_DATA_URL, 'two.png', db, dir);
    expect(listTaskImages(t.id, db)).toHaveLength(2);
    const full = getTask(t.id, db);
    expect(full?.images.map((i) => i.originalName)).toEqual(['one.png', 'two.png']);
  });
});

describe('deletion', () => {
  it('deleteTaskImage removes the row and the file', () => {
    const { db, dir } = fresh();
    const t = createTask({ title: 'A' }, db);
    const img = addTaskImage(t.id, PNG_DATA_URL, 'x.png', db, dir)!;
    expect(deleteTaskImage(img.id, db, dir)).toBe(true);
    expect(listTaskImages(t.id, db)).toHaveLength(0);
    expect(fs.existsSync(imageFilePath(img.filename, dir))).toBe(false);
  });

  it('deleteTask removes image rows and files too', () => {
    const { db, dir } = fresh();
    const t = createTask({ title: 'A' }, db);
    const img = addTaskImage(t.id, PNG_DATA_URL, 'x.png', db, dir)!;
    expect(deleteTask(t.id, db, dir)).toBe(true);
    const rows = db.prepare(`SELECT COUNT(*) AS n FROM task_images`).get() as any;
    expect(rows.n).toBe(0);
    expect(fs.existsSync(imageFilePath(img.filename, dir))).toBe(false);
  });
});
