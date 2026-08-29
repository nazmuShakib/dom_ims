import { describe, expect, it, vi } from 'vitest';

import { retryRead } from '@/lib/retry';

describe('transient read retry', () => {
  it('returns immediately when the first read succeeds', async () => {
    const operation = vi.fn(async () => 'session');
    const wait = vi.fn(async () => undefined);

    await expect(retryRead(operation, { wait })).resolves.toBe('session');
    expect(operation).toHaveBeenCalledTimes(1);
    expect(wait).not.toHaveBeenCalled();
  });

  it('recovers when a cold first read fails and the second succeeds', async () => {
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('temporary connection failure'))
      .mockResolvedValue('session');
    const wait = vi.fn(async () => undefined);

    await expect(retryRead(operation, { wait })).resolves.toBe('session');
    expect(operation).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledWith(200);
  });

  it('stops after the configured attempts and preserves the final error', async () => {
    const finalError = new Error('database unavailable');
    const operation = vi.fn(async () => {
      throw finalError;
    });

    await expect(
      retryRead(operation, { attempts: 3, wait: async () => undefined }),
    ).rejects.toBe(finalError);
    expect(operation).toHaveBeenCalledTimes(3);
  });
});
