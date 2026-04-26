import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TextTrackHandler } from './TextTrackHandler';
import { SegmentTemplateInfo } from '../dash/types';

// jsdom does not implement VTTCue — provide a minimal polyfill
if (typeof globalThis.VTTCue === 'undefined') {
  (globalThis as any).VTTCue = class VTTCue {
    startTime: number;
    endTime: number;
    text: string;
    constructor(start: number, end: number, text: string) {
      this.startTime = start;
      this.endTime = end;
      this.text = text;
    }
  };
}

// ── helpers ────────────────────────────────────────────────────────────────

function makeInfo(overrides: Partial<SegmentTemplateInfo> = {}): SegmentTemplateInfo {
  return {
    baseURL: 'http://example.com/',
    representationID: 'sub1',
    initialization: 'sub-$RepresentationID$-init.mp4',
    media: 'sub-$RepresentationID$-$Number$.m4s',
    totalDuration: 8, // 2 × 4s segments
    startNumber: 1,
    timescale: 1,
    duration: 4,
    useTimeTemplate: false,
    mimeType: 'text/vtt',
    codecs: '',
    bandwidth: 0,
    trackType: 'text',
    language: 'en',
    role: 'subtitles',
    ...overrides,
  };
}

const SAMPLE_VTT = `WEBVTT

00:00:01.000 --> 00:00:04.000
Hello world

00:00:05.000 --> 00:00:08.000
Second cue
`;

function makeMockTrack() {
  const cueList: any[] = [];
  const track: any = {
    mode: 'hidden' as TextTrackMode,
    language: '',
    addCue: vi.fn((cue: any) => { cueList.push(cue); }),
    _cueList: cueList,
  };
  // Make cues a live getter so length stays in sync after addCue calls
  Object.defineProperty(track, 'cues', {
    get: () => Object.assign(cueList, { item: (i: number) => cueList[i] }),
    enumerable: true,
  });
  return track;
}

function makeVideoEl(): HTMLVideoElement {
  const video = document.createElement('video');
  const tracks: ReturnType<typeof makeMockTrack>[] = [];

  // jsdom does not implement addTextTrack — replace with a mock
  vi.spyOn(video, 'addTextTrack').mockImplementation((kind, label, lang) => {
    const t = makeMockTrack();
    t.language = lang ?? '';
    tracks.push(t);
    Object.defineProperty(video, 'textTracks', {
      get: () => ({
        length: tracks.length,
        [Symbol.iterator]: tracks[Symbol.iterator].bind(tracks),
        ...Object.fromEntries(tracks.map((tr, i) => [i, tr])),
      }),
      configurable: true,
    });
    return t as unknown as TextTrack;
  });

  return video;
}

function makeFetcher(responseText: string) {
  const data = new TextEncoder().encode(responseText).buffer;
  return {
    fetchSegment: vi.fn().mockResolvedValue({ url: 'x', data }),
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('TextTrackHandler', () => {
  let video: HTMLVideoElement;

  beforeEach(() => {
    video = makeVideoEl();
  });

  it('registers a TextTrack on addTrack()', () => {
    const handler = new TextTrackHandler(video, makeFetcher(SAMPLE_VTT) as any);
    handler.addTrack(makeInfo());
    expect(video.textTracks.length).toBe(1);
    expect(video.textTracks[0].language).toBe('en');
    expect(video.textTracks[0].mode).toBe('hidden');
  });

  it('does not register duplicate tracks for the same language', () => {
    const handler = new TextTrackHandler(video, makeFetcher(SAMPLE_VTT) as any);
    handler.addTrack(makeInfo({ language: 'fr' }));
    handler.addTrack(makeInfo({ language: 'fr' })); // duplicate
    expect(video.textTracks.length).toBe(1);
  });

  it('getAvailableTracks returns all registered tracks', () => {
    const handler = new TextTrackHandler(video, makeFetcher('') as any);
    handler.addTrack(makeInfo({ language: 'en' }));
    handler.addTrack(makeInfo({ language: 'fr' }));
    const tracks = handler.getAvailableTracks();
    expect(tracks).toHaveLength(2);
    expect(tracks.map(t => t.language)).toContain('en');
    expect(tracks.map(t => t.language)).toContain('fr');
  });

  it('enable() sets track mode to showing and loads cues from VTT', async () => {
    const fetcher = makeFetcher(SAMPLE_VTT);
    const handler = new TextTrackHandler(video, fetcher as any);
    handler.addTrack(makeInfo({ mimeType: 'text/vtt', language: 'en' }));
    await handler.enable('en');

    const track = video.textTracks[0];
    expect(track.mode).toBe('showing');
    expect(fetcher.fetchSegment).toHaveBeenCalledOnce();
    // jsdom supports cues on TextTrack
    expect(track.cues).not.toBeNull();
    expect(track.cues!.length).toBe(2);
  });

  it('enable() hides other tracks when switching', async () => {
    const fetcher = makeFetcher(SAMPLE_VTT);
    const handler = new TextTrackHandler(video, fetcher as any);
    handler.addTrack(makeInfo({ language: 'en' }));
    handler.addTrack(makeInfo({ language: 'fr' }));

    await handler.enable('en');
    await handler.enable('fr');

    const enTrack = video.textTracks[0];
    const frTrack = video.textTracks[1];
    expect(frTrack.mode).toBe('showing');
    expect(enTrack.mode).toBe('hidden');
  });

  it('disable() hides all tracks', async () => {
    const fetcher = makeFetcher(SAMPLE_VTT);
    const handler = new TextTrackHandler(video, fetcher as any);
    handler.addTrack(makeInfo({ language: 'en' }));
    await handler.enable('en');
    handler.disable();
    expect(video.textTracks[0].mode).toBe('hidden');
  });

  it('does not fetch cues twice for the same track', async () => {
    const fetcher = makeFetcher(SAMPLE_VTT);
    const handler = new TextTrackHandler(video, fetcher as any);
    handler.addTrack(makeInfo({ language: 'en' }));
    await handler.enable('en');
    await handler.enable('en'); // second call
    expect(fetcher.fetchSegment).toHaveBeenCalledOnce();
  });

  it('warns but does not throw for unknown language in enable()', async () => {
    const handler = new TextTrackHandler(video, makeFetcher('') as any);
    await expect(handler.enable('zz')).resolves.toBeUndefined();
  });

  it('parses VTT timestamps correctly', async () => {
    const vtt = `WEBVTT\n\n01:02:03.500 --> 01:02:05.000\nTest\n`;
    const fetcher = makeFetcher(vtt);
    const handler = new TextTrackHandler(video, fetcher as any);
    handler.addTrack(makeInfo({ mimeType: 'text/vtt', language: 'en' }));
    await handler.enable('en');
    const cue = video.textTracks[0].cues![0] as VTTCue;
    expect(cue.startTime).toBeCloseTo(3723.5, 1);
    expect(cue.endTime).toBeCloseTo(3725, 1);
  });

  it('destroy() clears all tracks', () => {
    const handler = new TextTrackHandler(video, makeFetcher('') as any);
    handler.addTrack(makeInfo({ language: 'en' }));
    handler.destroy();
    expect(handler.getAvailableTracks()).toHaveLength(0);
  });
});
