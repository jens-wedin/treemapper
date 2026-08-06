import { describe, it, expect, vi } from 'vitest';
import { downloadAll } from './downloader';

const okResponse = () => new Response(new ArrayBuffer(8), { status: 200 });

describe('downloadAll', () => {
  it('downloads all tasks and reports success', async () => {
    const saved: string[] = [];
    const results = await downloadAll(
      [
        { id: 1, url: 'https://x/1.jpg', dest: 'media/1.jpg' },
        { id: 2, url: 'https://x/2.jpg', dest: 'media/2.jpg' },
      ],
      { fetchFn: vi.fn(async () => okResponse()), saveFile: async d => { saved.push(d); } },
    );
    expect(results.every(r => r.ok)).toBe(true);
    expect(saved.sort()).toEqual(['media/1.jpg', 'media/2.jpg']);
  });

  it('retries failures then succeeds', async () => {
    let calls = 0;
    const fetchFn = vi.fn(async () => {
      calls++;
      return calls < 3 ? new Response(null, { status: 500 }) : okResponse();
    });
    const results = await downloadAll(
      [{ id: 1, url: 'https://x/1.jpg', dest: 'media/1.jpg' }],
      { fetchFn, saveFile: async () => {}, retries: 3, retryDelayMs: 0 },
    );
    expect(results[0].ok).toBe(true);
    expect(calls).toBe(3);
  });

  it('marks a task failed after exhausting retries, without failing others', async () => {
    const fetchFn = vi.fn(async (url: RequestInfo | URL) =>
      String(url).includes('bad') ? new Response(null, { status: 404 }) : okResponse());
    const results = await downloadAll(
      [
        { id: 1, url: 'https://x/bad.jpg', dest: 'media/1.jpg' },
        { id: 2, url: 'https://x/good.jpg', dest: 'media/2.jpg' },
      ],
      { fetchFn, saveFile: async () => {}, retries: 2, retryDelayMs: 0 },
    );
    expect(results.find(r => r.id === 1)?.ok).toBe(false);
    expect(results.find(r => r.id === 1)?.error).toMatch(/404/);
    expect(results.find(r => r.id === 2)?.ok).toBe(true);
  });

  it('respects the concurrency limit', async () => {
    let active = 0, peak = 0;
    const fetchFn = vi.fn(async () => {
      active++; peak = Math.max(peak, active);
      await new Promise(r => setTimeout(r, 5));
      active--;
      return okResponse();
    });
    const tasks = Array.from({ length: 10 }, (_, i) => ({ id: i, url: `https://x/${i}`, dest: `media/${i}.jpg` }));
    await downloadAll(tasks, { fetchFn, saveFile: async () => {}, concurrency: 3 });
    expect(peak).toBeLessThanOrEqual(3);
  });
});
