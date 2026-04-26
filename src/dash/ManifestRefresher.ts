import { MPDParser } from './MPDParser';
import { SegmentTemplateInfo } from './types';
import { logger } from '../utils/Logger';

export interface ParsedMPD {
  videoTracks: SegmentTemplateInfo[];
  audioTracks: SegmentTemplateInfo[];
  textTracks: SegmentTemplateInfo[];
  isLive: boolean;
  minimumUpdatePeriod?: number; // ms
  availabilityStartTime?: Date;
  timeShiftBufferDepth?: number; // seconds
}

type ManifestUpdateCallback = (parsed: ParsedMPD) => void;

/**
 * Polls a live DASH manifest URL at the interval specified by minimumUpdatePeriod
 * and emits the refreshed parsed result to registered callbacks.
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
      const parsed: ParsedMPD = {
        ...raw,
        isLive: true,
      };
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

/**
 * Parse live-specific attributes from an MPD XML element.
 * Returns undefined for each field if the attribute is absent.
 */
export function parseLiveAttributes(mpd: Element): {
  isLive: boolean;
  minimumUpdatePeriod?: number;
  availabilityStartTime?: Date;
  timeShiftBufferDepth?: number;
} {
  const type = mpd.getAttribute('type');
  const isLive = type === 'dynamic';

  let minimumUpdatePeriod: number | undefined;
  const mupStr = mpd.getAttribute('minimumUpdatePeriod');
  if (mupStr) minimumUpdatePeriod = parseISO8601Duration(mupStr) * 1000; // to ms

  let availabilityStartTime: Date | undefined;
  const astStr = mpd.getAttribute('availabilityStartTime');
  if (astStr) availabilityStartTime = new Date(astStr);

  let timeShiftBufferDepth: number | undefined;
  const tsbdStr = mpd.getAttribute('timeShiftBufferDepth');
  if (tsbdStr) timeShiftBufferDepth = parseISO8601Duration(tsbdStr);

  return { isLive, minimumUpdatePeriod, availabilityStartTime, timeShiftBufferDepth };
}

/**
 * Parse ISO 8601 duration string (e.g. "PT5S", "PT1M30S") to seconds.
 */
export function parseISO8601Duration(duration: string): number {
  const re = /P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:([\d.]+)S)?/;
  const m = duration.match(re);
  if (!m) return 0;
  const [, years, months, days, hours, minutes, seconds] = m.map(v => parseFloat(v || '0'));
  return (years * 31536000) + (months * 2592000) + (days * 86400) +
         (hours * 3600) + (minutes * 60) + seconds;
}
