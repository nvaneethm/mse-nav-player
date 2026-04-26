import { SegmentDownloadResult } from '../types';
import { logger } from '../../utils/Logger';

/**
 * Simple URL-keyed cache for downloaded segment buffers.
 * Bandwidth measurements are intentionally excluded from cached results
 * to avoid skewing ABR estimates on cache hits.
 */
export class SegmentCache {
  private readonly store: Map<string, SegmentDownloadResult> = new Map();
  private enabled: boolean;

  constructor(enabled = true) {
    this.enabled = enabled;
  }

  get(url: string): SegmentDownloadResult | undefined {
    if (!this.enabled) return undefined;
    const hit = this.store.get(url);
    if (hit) logger.debug(`[SegmentCache] Hit: ${url}`);
    return hit;
  }

  set(url: string, data: ArrayBuffer): void {
    if (!this.enabled) return;
    this.store.set(url, { url, data });
  }

  clear(): void {
    this.store.clear();
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.clear();
  }
}
