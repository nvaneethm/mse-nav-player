import { logger } from '../../utils/Logger';

export class SegmentFetchError extends Error {
  constructor(
    message: string,
    public readonly url: string,
    public readonly status?: number,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'SegmentFetchError';
  }
}

export interface FetchResult {
  buffer: ArrayBuffer;
  durationMs: number;
}

/**
 * Controls concurrent outbound HTTP requests with per-URL abort support
 * and exponential-backoff retry.
 *
 * Responsibilities:
 * - Enforce MAX_CONCURRENT_REQUESTS ceiling
 * - Cancel duplicate in-flight requests for the same URL
 * - Retry with jittered exponential backoff
 * - Surface SegmentFetchError with HTTP status codes
 */
export class FetchQueue {
  private readonly MAX_CONCURRENT = 3;
  private readonly TIMEOUT_MS = 10_000;

  private active = 0;
  private readonly inFlight: Map<string, AbortController> = new Map();

  async fetch(url: string, maxRetries: number, byteRange?: string): Promise<FetchResult> {
    this.cancel(url);

    while (this.active >= this.MAX_CONCURRENT) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    this.active++;
    const controller = new AbortController();
    this.inFlight.set(url, controller);

    try {
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const timeoutId = setTimeout(() => controller.abort(), this.TIMEOUT_MS);
          const headers: HeadersInit = {};
          if (byteRange) headers['Range'] = `bytes=${byteRange}`;
          const response = await fetch(url, { signal: controller.signal, headers });
          clearTimeout(timeoutId);

          if (!response.ok) {
            throw new SegmentFetchError(`HTTP ${response.status}`, url, response.status);
          }

          const fetchStart = performance.now();
          const buffer = await response.arrayBuffer();
          const durationMs = performance.now() - fetchStart;

          return { buffer, durationMs };
        } catch (err) {
          if (err instanceof Error && err.name === 'AbortError') {
            throw new SegmentFetchError('Request timeout', url, undefined, err);
          }
          logger.warn(`[FetchQueue] Attempt ${attempt}/${maxRetries} failed for ${url}`, err);
          if (attempt === maxRetries) {
            throw new SegmentFetchError(`Failed after ${attempt} attempts`, url, undefined, err);
          }
          // Jittered exponential backoff
          const delay = 100 * Math.pow(2, attempt) * (0.5 + Math.random());
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
      throw new SegmentFetchError('Unknown fetch failure', url);
    } finally {
      this.active--;
      this.inFlight.delete(url);
    }
  }

  cancel(url: string): void {
    const ctrl = this.inFlight.get(url);
    if (ctrl) {
      ctrl.abort();
      this.inFlight.delete(url);
    }
  }

  destroy(): void {
    for (const ctrl of this.inFlight.values()) ctrl.abort();
    this.inFlight.clear();
    this.active = 0;
  }
}
