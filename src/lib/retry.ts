interface ReadRetryOptions {
  attempts?: number;
  delayMs?: number;
  wait?: (milliseconds: number) => Promise<void>;
}

const sleep = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

/**
 * Retry transient infrastructure failures only where the caller explicitly
 * knows the operation is read-only. Never wrap inventory mutations with this.
 */
export async function retryRead<T>(
  operation: () => Promise<T>,
  { attempts = 3, delayMs = 200, wait = sleep }: ReadRetryOptions = {},
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt + 1 < attempts) await wait(delayMs * 2 ** attempt);
    }
  }

  throw lastError;
}
