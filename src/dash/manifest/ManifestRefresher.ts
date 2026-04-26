import { logger } from '../../utils/Logger';
import { ParsedMPD } from '../types';
import { MPDParser } from './MPDParser';

type ManifestUpdateCallback = (parsed: ParsedMPD) => void;

/**
 * Polls a live DASH manifest URL at the interval specified by minimumUpdatePeriod
 * and emits the refreshed parsed result to registered callbacks.
 *
 * Responsibilities:
 * - Schedule periodic manifest re-fetches
 * - Invoke registered callbacks with the fresh ParsedMPD
 * - Graceful stop / destroy lifecycle
 */
export class ManifestRefresher {
  private readonly parser: MPDParser;
  private readonly url: string;
  private updatePeriodMs: number;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;
  private callbacks: Set<ManifestUpdateCallback> = new Set();

  constructor(url: string, parser: MPDParser, updatePeriodMs: number) {
    this.url = url;
    this.parser = parser;
    this.updatePeriodMs = updatePeriodMs;
  }

  onUpdate(cb: ManifestUpdateCallback): void {
    this.callbacks.add(cb);
  }

  start(): void {
    if (this.destroyed) return;
    this.scheduleNext();
    logger.info(`[ManifestRefresher] Started polling ${this.url} every ${this.updatePeriodMs}ms`);
  }

  stop(): void {
    this.destroyed = true;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    logger.info('[ManifestRefresher] Stopped');
  }

  private scheduleNext(): void {
    if (this.destroyed) return;
    this.timer = setTimeout(() => this.refresh(), this.updatePeriodMs);
  }

  private async refresh(): Promise<void> {
    if (this.destroyed) return;
    try {
      const raw = await this.parser.parse(this.url);
      const parsed: ParsedMPD = { ...raw, isLive: true };
      for (const cb of this.callbacks) {
        try { cb(parsed); } catch (e) { logger.warn('[ManifestRefresher] Callback error:', e); }
      }
    } catch (err) {
      logger.warn('[ManifestRefresher] Refresh failed:', err);
    } finally {
      this.scheduleNext();
    }
  }
}
