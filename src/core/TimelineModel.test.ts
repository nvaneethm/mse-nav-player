import { describe, it, expect } from 'vitest';
import { TimelineModel } from './TimelineModel';
import { SegmentTemplateInfo } from '../dash/types';

function makeSegment(overrides: Partial<SegmentTemplateInfo> = {}): SegmentTemplateInfo {
  return {
    baseURL: 'http://example.com/',
    representationID: 'r1',
    initialization: 'init.mp4',
    media: 'seg$Number$.m4s',
    startNumber: 1,
    timescale: 1,
    duration: 4,
    useTimeTemplate: false,
    mimeType: 'video/mp4',
    codecs: 'avc1.42E01E',
    bandwidth: 1_000_000,
    ...overrides,
  };
}

const THREE_SEGS = [makeSegment(), makeSegment(), makeSegment()];

describe('TimelineModel — basic', () => {
  it('returns total duration', () => {
    const tm = new TimelineModel(THREE_SEGS);
    expect(tm.getTotalDuration()).toBe(12);
  });

  it('returns segment count', () => {
    const tm = new TimelineModel(THREE_SEGS);
    expect(tm.getSegmentCount()).toBe(3);
  });

  it('finds segment for time within first segment', () => {
    const tm = new TimelineModel(THREE_SEGS);
    expect(tm.getSegmentForTime(0)).toBe(THREE_SEGS[0]);
    expect(tm.getSegmentForTime(3.9)).toBe(THREE_SEGS[0]);
  });

  it('finds segment for time at boundary', () => {
    const tm = new TimelineModel(THREE_SEGS);
    expect(tm.getSegmentForTime(4)).toBe(THREE_SEGS[1]);
    expect(tm.getSegmentForTime(8)).toBe(THREE_SEGS[2]);
  });

  it('returns last segment when time is beyond total duration', () => {
    const tm = new TimelineModel(THREE_SEGS);
    expect(tm.getSegmentForTime(100)).toBe(THREE_SEGS[2]);
  });

  it('getSegmentAtIndex returns correct segment', () => {
    const tm = new TimelineModel(THREE_SEGS);
    expect(tm.getSegmentAtIndex(1)).toBe(THREE_SEGS[1]);
  });

  it('getTimeForSegmentIndex sums prior durations', () => {
    const tm = new TimelineModel(THREE_SEGS);
    expect(tm.getTimeForSegmentIndex(0)).toBe(0);
    expect(tm.getTimeForSegmentIndex(1)).toBe(4);
    expect(tm.getTimeForSegmentIndex(2)).toBe(8);
  });

  it('throws on invalid segment index', () => {
    const tm = new TimelineModel(THREE_SEGS);
    expect(() => tm.getSegmentAtIndex(-1)).toThrow();
    expect(() => tm.getSegmentAtIndex(99)).toThrow();
  });

  it('throws after destroy', () => {
    const tm = new TimelineModel(THREE_SEGS);
    tm.destroy();
    expect(() => tm.getTotalDuration()).toThrow();
    expect(() => tm.getSegmentForTime(0)).toThrow();
  });

  it('throws for empty segment array', () => {
    expect(() => new TimelineModel([])).toThrow();
  });

  it('throws for negative time', () => {
    const tm = new TimelineModel(THREE_SEGS);
    expect(() => tm.getSegmentForTime(-1)).toThrow();
  });
});

// ── Live helpers ──────────────────────────────────────────────────────────

describe('TimelineModel — live helpers', () => {
  it('getLiveEdge returns end of last segment', () => {
    const tm = new TimelineModel(THREE_SEGS);
    expect(tm.getLiveEdge()).toBe(12); // 3 × 4s
  });

  it('getAvailabilityRange covers full timeline for fresh stream', () => {
    const tm = new TimelineModel(THREE_SEGS);
    expect(tm.getAvailabilityRange()).toEqual({ start: 0, end: 12 });
  });

  it('appendSegments extends the timeline', () => {
    const tm = new TimelineModel([makeSegment()]);
    tm.appendSegments([makeSegment(), makeSegment()]);
    expect(tm.getSegmentCount()).toBe(3);
    expect(tm.getLiveEdge()).toBe(12);
  });

  it('trimBefore removes expired segments and advances offset', () => {
    const tm = new TimelineModel(THREE_SEGS);
    // Remove segments whose end < 8 (first two segments end at 4 and 8)
    tm.trimBefore(8);
    expect(tm.getSegmentCount()).toBe(1); // only 3rd segment remains
    expect(tm.getAvailabilityRange().start).toBe(8);
  });

  it('trimBefore with DVR window keeps recent segments', () => {
    const segs = Array.from({ length: 6 }, () => makeSegment());
    const tm = new TimelineModel(segs);
    // Edge is at 24s, DVR depth 12s → trim before 12s (first 3 segments)
    tm.trimBefore(12);
    expect(tm.getSegmentCount()).toBe(3);
    expect(tm.getAvailabilityRange().start).toBe(12);
    expect(tm.getLiveEdge()).toBe(24);
  });

  it('setPresentationTimeOffset shifts getAvailabilityRange', () => {
    const tm = new TimelineModel(THREE_SEGS);
    tm.setPresentationTimeOffset(100);
    expect(tm.getAvailabilityRange()).toEqual({ start: 100, end: 112 });
    expect(tm.getLiveEdge()).toBe(112);
  });
});
