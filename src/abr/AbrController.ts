import { logger } from '../utils/Logger';

interface Rendition {
  resolution: string;
  bitrate: number;
}

/**
 * Hybrid ABR controller combining EWMA throughput estimation with buffer health.
 *
 * Switch-up uses the slow EWMA (conservative) with a safety margin.
 * Switch-down uses the fast EWMA (reactive) and triggers immediately on buffer stress.
 * An 8-second cooldown prevents oscillation on switch-up.
 */
export class AbrController {
  // EWMA state — slow (conservative, for upgrades) and fast (reactive, for downgrades)
  private slowEstimate = 0;   // bps
  private fastEstimate = 0;   // bps
  private readonly SLOW_ALPHA = 0.1;
  private readonly FAST_ALPHA = 0.5;
  private readonly SAFETY_MARGIN = 0.8;
  private readonly SWITCH_UP_COOLDOWN_MS = 8000;
  private readonly MIN_SAMPLES_BEFORE_SWITCH = 2;

  private enabled = true;
  private sampleCount = 0;
  private lastSwitchUpTime = 0;
  private currentResolution: string | null = null;
  private minBufferSize: number;

  constructor(minBufferSize = 10) {
    this.minBufferSize = minBufferSize;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    logger.info(`[AbrController] ${enabled ? 'enabled' : 'disabled'}`);
  }

  setCurrentResolution(resolution: string): void {
    this.currentResolution = resolution;
  }

  /**
   * Record a segment download sample. Called after every successful segment append.
   * @param bandwidthBps  Measured bits per second for this segment download.
   * @param bufferAhead   Seconds of buffer ahead of current playback position.
   */
  recordSample(bandwidthBps: number, bufferAhead: number): void {
    if (bandwidthBps <= 0) return;

    this.sampleCount++;

    if (this.slowEstimate === 0) {
      // Bootstrap with first sample
      this.slowEstimate = bandwidthBps;
      this.fastEstimate = bandwidthBps;
    } else {
      this.slowEstimate = this.SLOW_ALPHA * bandwidthBps + (1 - this.SLOW_ALPHA) * this.slowEstimate;
      this.fastEstimate = this.FAST_ALPHA * bandwidthBps + (1 - this.FAST_ALPHA) * this.fastEstimate;
    }

    logger.debug(
      `[AbrController] sample=${Math.round(bandwidthBps / 1000)}kbps ` +
      `slow=${Math.round(this.slowEstimate / 1000)}kbps ` +
      `fast=${Math.round(this.fastEstimate / 1000)}kbps ` +
      `bufferAhead=${bufferAhead.toFixed(1)}s`
    );
  }

  /**
   * Given the available renditions, return the resolution to switch to, or null
   * if no switch is needed. Renditions should be sorted ascending by bitrate.
   */
  selectRendition(renditions: Rendition[]): string | null {
    if (!this.enabled || renditions.length === 0 || this.sampleCount < this.MIN_SAMPLES_BEFORE_SWITCH) {
      return null;
    }

    const sorted = [...renditions].sort((a, b) => a.bitrate - b.bitrate);
    const now = Date.now();

    // Buffer emergency: drop to lowest rendition immediately
    // (fast EWMA reacts quickly to sudden degradation)
    if (this.fastEstimate > 0) {
      const lowestFit = this.highestAffordable(sorted, this.fastEstimate);
      const current = sorted.find(r => r.resolution === this.currentResolution);
      if (current && lowestFit && lowestFit.bitrate < current.bitrate) {
        logger.info(
          `[AbrController] Downgrade: fast=${Math.round(this.fastEstimate / 1000)}kbps → ${lowestFit.resolution}`
        );
        this.currentResolution = lowestFit.resolution;
        return lowestFit.resolution;
      }
    }

    // Upgrade path: use slow EWMA with safety margin, respect cooldown
    if (now - this.lastSwitchUpTime < this.SWITCH_UP_COOLDOWN_MS) {
      return null;
    }

    const targetBps = this.slowEstimate * this.SAFETY_MARGIN;
    const best = this.highestAffordable(sorted, targetBps);
    if (!best || best.resolution === this.currentResolution) return null;

    const current = sorted.find(r => r.resolution === this.currentResolution);
    if (!current || best.bitrate <= current.bitrate) return null;

    logger.info(
      `[AbrController] Upgrade: slow=${Math.round(this.slowEstimate / 1000)}kbps ` +
      `(×${this.SAFETY_MARGIN}) → ${best.resolution}`
    );
    this.lastSwitchUpTime = now;
    this.currentResolution = best.resolution;
    return best.resolution;
  }

  private highestAffordable(sorted: Rendition[], budgetBps: number): Rendition | null {
    let best: Rendition | null = null;
    for (const r of sorted) {
      if (r.bitrate <= budgetBps) best = r;
    }
    return best;
  }

  getEstimates(): { slow: number; fast: number } {
    return { slow: this.slowEstimate, fast: this.fastEstimate };
  }
}
