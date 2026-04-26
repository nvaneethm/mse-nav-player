import { SegmentDownloadResult } from '../types';
import { SegmentCache } from './SegmentCache';
import { FetchQueue } from './FetchQueue';

export { SegmentFetchError } from './FetchQueue';

/**
 * Public interface for downloading DASH media segments.
 *
 * Composes:
 * - SegmentCache  — avoids redundant network requests
 * - FetchQueue    — manages concurrency, retries, and abort
 *
 * Also measures download bandwidth (bits/sec) per fetch for ABR sampling.
 * Bandwidth is NOT stored in the cache so estimates reflect real network
 * conditions rather than memory read speed.
 */
export class SegmentFetcher {
  private readonly cache: SegmentCache;
  private readonly queue: FetchQueue;
  private readonly maxRetries: number;

  constructor(maxRetries = 3, cacheEnabled = true) {
    this.maxRetries = maxRetries;
    this.cache = new SegmentCache(cacheEnabled);
    this.queue = new FetchQueue();
  }

  async fetchSegment(url: string): Promise<SegmentDownloadResult> {
    const cached = this.cache.get(url);
    if (cached) return cached;

    const { buffer, durationMs } = await this.queue.fetch(url, this.maxRetries);

    const downloadBandwidth = durationMs > 0
      ? (buffer.byteLength * 8) / (durationMs / 1000)
      : undefined;

    this.cache.set(url, buffer);

    return { url, data: buffer, downloadBandwidth };
  }

  /** Fetch a byte-range slice of a file. Bypasses cache (ranges are unique). */
  async fetchSegmentWithRange(url: string, byteRange: string): Promise<SegmentDownloadResult> {
    const { buffer, durationMs } = await this.queue.fetch(url, this.maxRetries, byteRange);

    const downloadBandwidth = durationMs > 0
      ? (buffer.byteLength * 8) / (durationMs / 1000)
      : undefined;

    return { url, data: buffer, downloadBandwidth };
  }

  clearCache(): void {
    this.cache.clear();
  }

  setCacheEnabled(enabled: boolean): void {
    this.cache.setEnabled(enabled);
  }

  destroy(): void {
    this.queue.destroy();
    this.cache.clear();
  }
}
