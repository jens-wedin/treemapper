import fs from 'node:fs/promises';
import path from 'node:path';

export interface DownloadTask { id: number; url: string; dest: string }
export interface DownloadResult { id: number; ok: boolean; error?: string }

export interface DownloadOptions {
  fetchFn?: typeof fetch;
  saveFile?: (dest: string, data: ArrayBuffer) => Promise<void>;
  concurrency?: number;
  retries?: number;
  retryDelayMs?: number;
  onProgress?: (done: number, total: number) => void;
}

const defaultSave = async (dest: string, data: ArrayBuffer) => {
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, Buffer.from(data));
};

export async function downloadAll(tasks: DownloadTask[], opts: DownloadOptions = {}): Promise<DownloadResult[]> {
  const {
    fetchFn = fetch,
    saveFile = defaultSave,
    concurrency = 6,
    retries = 3,
    retryDelayMs = 500,
    onProgress,
  } = opts;

  const results: DownloadResult[] = [];
  let done = 0;
  const queue = [...tasks];

  async function worker() {
    for (let task = queue.shift(); task; task = queue.shift()) {
      let lastError = 'unknown';
      let ok = false;
      for (let attempt = 1; attempt <= retries && !ok; attempt++) {
        try {
          const res = await fetchFn(task.url);
          if (!res.ok) {
            lastError = `HTTP ${res.status}`;
          } else {
            await saveFile(task.dest, await res.arrayBuffer());
            ok = true;
          }
        } catch (err) {
          lastError = err instanceof Error ? err.message : String(err);
        }
        if (!ok && attempt < retries) await new Promise(r => setTimeout(r, retryDelayMs * attempt));
      }
      results.push(ok ? { id: task.id, ok } : { id: task.id, ok, error: lastError });
      onProgress?.(++done, tasks.length);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker));
  return results;
}
