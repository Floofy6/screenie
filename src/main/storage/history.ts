import { promises as fs } from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import type { CaptureResult } from '@shared/types';

const MAX_HISTORY_ITEMS = 500;
const HISTORY_FILE_NAME = 'screenie-history.json';

function getHistoryFilePath(): string {
  return path.join(app.getPath('userData'), HISTORY_FILE_NAME);
}

export class HistoryStore {
  private cache: CaptureResult[] | null = null;

  private async ensureLoaded(): Promise<CaptureResult[]> {
    if (this.cache) {
      return this.cache;
    }

    try {
      const filePath = getHistoryFilePath();
      const raw = await fs.readFile(filePath, 'utf8');
      const parsed = JSON.parse(raw) as CaptureResult[];
      this.cache = Array.isArray(parsed) ? parsed : [];
    } catch {
      this.cache = [];
    }

    return this.cache;
  }

  private async persist(values: CaptureResult[]): Promise<void> {
    const filePath = getHistoryFilePath();
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(values, null, 2), 'utf8');
  }

  async list(): Promise<CaptureResult[]> {
    return this.ensureLoaded();
  }

  async add(record: CaptureResult): Promise<CaptureResult> {
    const records = await this.ensureLoaded();
    const exists = records.find((entry) => entry.id === record.id);
    const nextList = [record, ...records.filter((entry) => entry.id !== record.id)].slice(0, MAX_HISTORY_ITEMS);
    this.cache = nextList;
    await this.persist(nextList);
    return record;
  }

  async remove(id: string): Promise<void> {
    const records = await this.ensureLoaded();
    this.cache = records.filter((entry) => entry.id !== id);
    await this.persist(this.cache);
  }
}

