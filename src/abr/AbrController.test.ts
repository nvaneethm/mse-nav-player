import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { AbrController } from './AbrController';

const RENDITIONS = [
  { resolution: '480x270', bitrate: 300_000 },
  { resolution: '640x360', bitrate: 800_000 },
  { resolution: '1280x720', bitrate: 2_500_000 },
  { resolution: '1920x1080', bitrate: 6_000_000 },
];

describe('AbrController', () => {
  let abr: AbrController;

  beforeEach(() => {
    abr = new AbrController(10);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns null before MIN_SAMPLES_BEFORE_SWITCH samples', () => {
    abr.setCurrentResolution('640x360');
    abr.recordSample(10_000_000, 15); // 10 Mbps — plenty
    // only 1 sample recorded; threshold is 2
    expect(abr.selectRendition(RENDITIONS)).toBeNull();
  });

  it('bootstraps estimates from first sample', () => {
    abr.recordSample(5_000_000, 20);
    const { slow, fast } = abr.getEstimates();
    expect(slow).toBe(5_000_000);
    expect(fast).toBe(5_000_000);
  });

  it('applies EWMA correctly for slow and fast estimates', () => {
    abr.recordSample(4_000_000, 20); // bootstrap
    abr.recordSample(2_000_000, 20);
    const { slow, fast } = abr.getEstimates();
    // slow: 0.1 * 2M + 0.9 * 4M = 3.8M
    expect(slow).toBeCloseTo(3_800_000, -3);
    // fast: 0.5 * 2M + 0.5 * 4M = 3M
    expect(fast).toBeCloseTo(3_000_000, -3);
  });

  it('selects highest affordable rendition on upgrade', () => {
    abr.setCurrentResolution('480x270');
    // Feed enough samples to pass MIN_SAMPLES_BEFORE_SWITCH
    abr.recordSample(10_000_000, 20);
    abr.recordSample(10_000_000, 20);
    // slow EWMA ~10Mbps * 0.8 safety = 8Mbps → can afford 1080p (6Mbps)
    const chosen = abr.selectRendition(RENDITIONS);
    expect(chosen).toBe('1920x1080');
  });

  it('does not upgrade within cooldown window', () => {
    abr.setCurrentResolution('480x270');
    abr.recordSample(10_000_000, 20);
    abr.recordSample(10_000_000, 20);
    const first = abr.selectRendition(RENDITIONS); // triggers upgrade, sets cooldown
    expect(first).not.toBeNull();

    // Advance time by less than 8 seconds
    vi.advanceTimersByTime(4_000);
    abr.recordSample(10_000_000, 20);
    const second = abr.selectRendition(RENDITIONS); // still in cooldown
    expect(second).toBeNull();
  });

  it('upgrades after cooldown expires', () => {
    abr.setCurrentResolution('480x270');
    abr.recordSample(10_000_000, 20);
    abr.recordSample(10_000_000, 20);
    abr.selectRendition(RENDITIONS); // first upgrade

    // Now current is 1080p, drop to 480p artificially to allow another test
    abr.setCurrentResolution('480x270');
    vi.advanceTimersByTime(9_000); // past cooldown
    abr.recordSample(10_000_000, 20);
    const after = abr.selectRendition(RENDITIONS);
    expect(after).toBe('1920x1080');
  });

  it('downgrades immediately when fast EWMA is too low', () => {
    abr.setCurrentResolution('1920x1080'); // 6Mbps rendition
    abr.recordSample(1_000_000, 20); // bootstrap
    abr.recordSample(1_000_000, 20); // fast EWMA ~1Mbps — can't afford 1080p
    const chosen = abr.selectRendition(RENDITIONS);
    // Should downgrade — 1Mbps * safety still can't afford 1080p (6Mbps) or 720p (2.5Mbps)
    expect(chosen).toBe('640x360'); // 800kbps is affordable
  });

  it('returns null when disabled — simulates manual rendition lock', () => {
    // Player.setRendition() disables ABR so high-bandwidth samples
    // don't immediately override the user's manual selection.
    abr.setEnabled(false);
    abr.setCurrentResolution('480x270');
    abr.recordSample(10_000_000, 20);
    abr.recordSample(10_000_000, 20);
    expect(abr.selectRendition(RENDITIONS)).toBeNull();
  });

  it('returns null when already on best affordable rendition', () => {
    abr.setCurrentResolution('1920x1080');
    abr.recordSample(10_000_000, 20);
    abr.recordSample(10_000_000, 20);
    // Already on highest, fast EWMA also high — no downgrade needed
    expect(abr.selectRendition(RENDITIONS)).toBeNull();
  });

  it('resumes switching after re-enabling from manual lock', () => {
    abr.setEnabled(false);
    abr.setCurrentResolution('480x270');
    abr.recordSample(10_000_000, 20);
    abr.recordSample(10_000_000, 20);
    expect(abr.selectRendition(RENDITIONS)).toBeNull(); // locked

    abr.setEnabled(true);
    const chosen = abr.selectRendition(RENDITIONS);
    expect(chosen).toBe('1920x1080'); // now free to upgrade
  });

  it('ignores zero-bandwidth samples', () => {
    abr.recordSample(0, 15);
    expect(abr.getEstimates().slow).toBe(0);
    expect(abr.getEstimates().fast).toBe(0);
  });
});
