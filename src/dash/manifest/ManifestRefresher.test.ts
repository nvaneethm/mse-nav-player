import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseISO8601Duration, parseLiveAttributes } from './liveUtils';
import { ManifestRefresher } from './ManifestRefresher';
import { MPDParser } from './MPDParser';

// ── parseISO8601Duration ───────────────────────────────────────────────────

describe('parseISO8601Duration', () => {
  it('parses seconds only', () => {
    expect(parseISO8601Duration('PT5S')).toBe(5);
  });

  it('parses minutes and seconds', () => {
    expect(parseISO8601Duration('PT1M30S')).toBe(90);
  });

  it('parses hours, minutes, seconds', () => {
    expect(parseISO8601Duration('PT1H2M3S')).toBe(3723);
  });

  it('parses fractional seconds', () => {
    expect(parseISO8601Duration('PT2.5S')).toBeCloseTo(2.5);
  });

  it('parses days', () => {
    expect(parseISO8601Duration('P1DT0S')).toBe(86400);
  });

  it('returns 0 for empty/invalid string', () => {
    expect(parseISO8601Duration('')).toBe(0);
    expect(parseISO8601Duration('invalid')).toBe(0);
  });
});

// ── parseLiveAttributes ────────────────────────────────────────────────────

describe('parseLiveAttributes', () => {
  function makeEl(attrs: Record<string, string>): Element {
    const el = document.createElement('MPD');
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
  }

  it('detects static (VOD) stream', () => {
    const el = makeEl({ type: 'static' });
    expect(parseLiveAttributes(el).isLive).toBe(false);
  });

  it('detects dynamic (live) stream', () => {
    const el = makeEl({ type: 'dynamic' });
    expect(parseLiveAttributes(el).isLive).toBe(true);
  });

  it('parses minimumUpdatePeriod to ms', () => {
    const el = makeEl({ type: 'dynamic', minimumUpdatePeriod: 'PT5S' });
    expect(parseLiveAttributes(el).minimumUpdatePeriod).toBe(5000);
  });

  it('parses timeShiftBufferDepth to seconds', () => {
    const el = makeEl({ type: 'dynamic', timeShiftBufferDepth: 'PT1M' });
    expect(parseLiveAttributes(el).timeShiftBufferDepth).toBe(60);
  });

  it('parses availabilityStartTime as Date', () => {
    const el = makeEl({ availabilityStartTime: '2024-01-01T00:00:00Z' });
    const result = parseLiveAttributes(el);
    expect(result.availabilityStartTime).toBeInstanceOf(Date);
    expect(result.availabilityStartTime!.getFullYear()).toBe(2024);
  });

  it('returns undefined for absent optional fields', () => {
    const el = makeEl({ type: 'dynamic' });
    const result = parseLiveAttributes(el);
    expect(result.minimumUpdatePeriod).toBeUndefined();
    expect(result.timeShiftBufferDepth).toBeUndefined();
    expect(result.availabilityStartTime).toBeUndefined();
  });
});

// ── ManifestRefresher ──────────────────────────────────────────────────────

describe('ManifestRefresher', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('calls onUpdate callback after the poll interval', async () => {
    const mockParse = vi.fn().mockResolvedValue({
      videoTracks: [{ bandwidth: 1000, resolution: '640x360', duration: 4, timescale: 1 }],
      audioTracks: [],
      textTracks: [],
      isLive: true,
    });
    const parser = { parse: mockParse } as unknown as MPDParser;
    const cb = vi.fn();

    const refresher = new ManifestRefresher('http://fake.mpd', parser, 3000);
    refresher.onUpdate(cb);
    refresher.start();

    // No call yet
    expect(cb).not.toHaveBeenCalled();

    // Advance past poll interval
    await vi.advanceTimersByTimeAsync(3100);
    expect(cb).toHaveBeenCalledOnce();
    expect(cb.mock.calls[0][0].isLive).toBe(true);
  });

  it('keeps polling after each interval', async () => {
    const mockParse = vi.fn().mockResolvedValue({
      videoTracks: [], audioTracks: [], textTracks: [], isLive: true,
    });
    const parser = { parse: mockParse } as unknown as MPDParser;
    const cb = vi.fn();

    const refresher = new ManifestRefresher('http://fake.mpd', parser, 1000);
    refresher.onUpdate(cb);
    refresher.start();

    await vi.advanceTimersByTimeAsync(3100);
    expect(cb.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it('stops polling after stop() is called', async () => {
    const mockParse = vi.fn().mockResolvedValue({
      videoTracks: [], audioTracks: [], textTracks: [], isLive: true,
    });
    const parser = { parse: mockParse } as unknown as MPDParser;
    const cb = vi.fn();

    const refresher = new ManifestRefresher('http://fake.mpd', parser, 1000);
    refresher.onUpdate(cb);
    refresher.start();
    await vi.advanceTimersByTimeAsync(1100);
    const countAfterOne = cb.mock.calls.length;
    refresher.stop();
    await vi.advanceTimersByTimeAsync(3000);
    expect(cb.mock.calls.length).toBe(countAfterOne); // no new calls
  });

  it('does not crash when parse throws', async () => {
    const mockParse = vi.fn().mockRejectedValue(new Error('network error'));
    const parser = { parse: mockParse } as unknown as MPDParser;
    const cb = vi.fn();

    const refresher = new ManifestRefresher('http://fake.mpd', parser, 1000);
    refresher.onUpdate(cb);
    refresher.start();
    await vi.advanceTimersByTimeAsync(1100);
    expect(cb).not.toHaveBeenCalled(); // error swallowed, no crash
    refresher.stop();
  });
});
