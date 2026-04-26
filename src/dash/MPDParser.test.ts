import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MPDParser, MPDParseError } from './MPDParser';

// ── MPD fixtures ───────────────────────────────────────────────────────────

const VOD_MPD = `<?xml version="1.0"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="static"
     mediaPresentationDuration="PT60S">
  <Period>
    <AdaptationSet mimeType="video/mp4">
      <SegmentTemplate initialization="init-$RepresentationID$.mp4"
                       media="seg-$RepresentationID$-$Number$.m4s"
                       startNumber="1" timescale="1" duration="4"/>
      <Representation id="v1" bandwidth="800000" width="640" height="360" codecs="avc1.42E01E"/>
      <Representation id="v2" bandwidth="2500000" width="1280" height="720" codecs="avc1.42E01E"/>
    </AdaptationSet>
    <AdaptationSet mimeType="audio/mp4">
      <SegmentTemplate initialization="init-audio.mp4"
                       media="seg-audio-$Number$.m4s"
                       startNumber="1" timescale="1" duration="4"/>
      <Representation id="a1" bandwidth="128000" codecs="mp4a.40.2"/>
    </AdaptationSet>
  </Period>
</MPD>`;

const LIVE_MPD = `<?xml version="1.0"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="dynamic"
     minimumUpdatePeriod="PT5S"
     availabilityStartTime="2024-01-01T00:00:00Z"
     timeShiftBufferDepth="PT30S">
  <Period>
    <AdaptationSet mimeType="video/mp4">
      <SegmentTemplate initialization="init.mp4"
                       media="seg$Number$.m4s"
                       startNumber="1" timescale="1" duration="4"/>
      <Representation id="v1" bandwidth="800000" width="640" height="360" codecs="avc1.42E01E"/>
    </AdaptationSet>
  </Period>
</MPD>`;

const TEXT_MPD = `<?xml version="1.0"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="static"
     mediaPresentationDuration="PT60S">
  <Period>
    <AdaptationSet mimeType="video/mp4">
      <SegmentTemplate initialization="init.mp4" media="seg$Number$.m4s"
                       startNumber="1" timescale="1" duration="4"/>
      <Representation id="v1" bandwidth="800000" width="640" height="360" codecs="avc1.42E01E"/>
    </AdaptationSet>
    <AdaptationSet mimeType="text/vtt" lang="en">
      <Role schemeIdUri="urn:mpeg:dash:role:2011" value="subtitle"/>
      <SegmentTemplate initialization="sub-init.vtt" media="sub$Number$.vtt"
                       startNumber="1" timescale="1" duration="4"/>
      <Representation id="s1" bandwidth="0"/>
    </AdaptationSet>
    <AdaptationSet mimeType="application/mp4" lang="fr">
      <ContentComponent contentType="text"/>
      <SegmentTemplate initialization="fr-init.mp4" media="fr$Number$.m4s"
                       startNumber="1" timescale="1" duration="4"/>
      <Representation id="s2" bandwidth="0" codecs="stpp"/>
    </AdaptationSet>
  </Period>
</MPD>`;

const NO_VIDEO_MPD = `<?xml version="1.0"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="static"
     mediaPresentationDuration="PT60S">
  <Period>
    <AdaptationSet mimeType="audio/mp4">
      <SegmentTemplate initialization="init.mp4" media="seg$Number$.m4s"
                       startNumber="1" timescale="1" duration="4"/>
      <Representation id="a1" bandwidth="128000" codecs="mp4a.40.2"/>
    </AdaptationSet>
  </Period>
</MPD>`;

// ── fetch mock helper ──────────────────────────────────────────────────────

function mockFetch(body: string, status = 200) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null } as any,
    text: async () => body,
  } as any);
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('MPDParser — VOD', () => {
  let parser: MPDParser;

  beforeEach(() => { parser = new MPDParser(); });
  afterEach(() => vi.restoreAllMocks());

  it('parses video and audio tracks', async () => {
    mockFetch(VOD_MPD);
    const { videoTracks, audioTracks } = await parser.parse('http://x.com/manifest.mpd');
    expect(videoTracks).toHaveLength(2);
    expect(audioTracks).toHaveLength(1);
  });

  it('sets trackType on video tracks', async () => {
    mockFetch(VOD_MPD);
    const { videoTracks } = await parser.parse('http://x.com/manifest.mpd');
    expect(videoTracks.every(t => t.trackType === 'video')).toBe(true);
  });

  it('sets trackType on audio tracks', async () => {
    mockFetch(VOD_MPD);
    const { audioTracks } = await parser.parse('http://x.com/manifest.mpd');
    expect(audioTracks.every(t => t.trackType === 'audio')).toBe(true);
  });

  it('parses resolution and bandwidth', async () => {
    mockFetch(VOD_MPD);
    const { videoTracks } = await parser.parse('http://x.com/manifest.mpd');
    expect(videoTracks[0].resolution).toBe('640x360');
    expect(videoTracks[0].bandwidth).toBe(800_000);
    expect(videoTracks[1].resolution).toBe('1280x720');
    expect(videoTracks[1].bandwidth).toBe(2_500_000);
  });

  it('sets totalDuration from mediaPresentationDuration', async () => {
    mockFetch(VOD_MPD);
    const { videoTracks } = await parser.parse('http://x.com/manifest.mpd');
    expect(videoTracks[0].totalDuration).toBe(60);
  });

  it('isLive is false for static MPD', async () => {
    mockFetch(VOD_MPD);
    const result = await parser.parse('http://x.com/manifest.mpd');
    expect(result.isLive).toBe(false);
  });

  it('textTracks is empty for VOD with no text tracks', async () => {
    mockFetch(VOD_MPD);
    const { textTracks } = await parser.parse('http://x.com/manifest.mpd');
    expect(textTracks).toHaveLength(0);
  });

  it('throws MPDParseError when fetch fails', async () => {
    mockFetch('', 404);
    await expect(parser.parse('http://x.com/manifest.mpd')).rejects.toBeInstanceOf(MPDParseError);
  });

  it('throws MPDParseError when no video tracks found', async () => {
    mockFetch(NO_VIDEO_MPD);
    await expect(parser.parse('http://x.com/manifest.mpd')).rejects.toBeInstanceOf(MPDParseError);
  });

  it('throws MPDParseError for invalid XML', async () => {
    mockFetch('<not valid xml >>>');
    await expect(parser.parse('http://x.com/manifest.mpd')).rejects.toBeInstanceOf(MPDParseError);
  });
});

describe('MPDParser — Live', () => {
  let parser: MPDParser;

  beforeEach(() => { parser = new MPDParser(); });
  afterEach(() => vi.restoreAllMocks());

  it('detects live stream', async () => {
    mockFetch(LIVE_MPD);
    const result = await parser.parse('http://x.com/live.mpd');
    expect(result.isLive).toBe(true);
  });

  it('parses minimumUpdatePeriod in ms', async () => {
    mockFetch(LIVE_MPD);
    const result = await parser.parse('http://x.com/live.mpd');
    expect(result.minimumUpdatePeriod).toBe(5000);
  });

  it('parses timeShiftBufferDepth in seconds', async () => {
    mockFetch(LIVE_MPD);
    const result = await parser.parse('http://x.com/live.mpd');
    expect(result.timeShiftBufferDepth).toBe(30);
  });

  it('parses availabilityStartTime as Date', async () => {
    mockFetch(LIVE_MPD);
    const result = await parser.parse('http://x.com/live.mpd');
    expect(result.availabilityStartTime).toBeInstanceOf(Date);
  });
});

describe('MPDParser — Text tracks', () => {
  let parser: MPDParser;

  beforeEach(() => { parser = new MPDParser(); });
  afterEach(() => vi.restoreAllMocks());

  it('parses WebVTT text track', async () => {
    mockFetch(TEXT_MPD);
    const { textTracks } = await parser.parse('http://x.com/manifest.mpd');
    const vtt = textTracks.find(t => t.mimeType === 'text/vtt');
    expect(vtt).toBeDefined();
    expect(vtt!.trackType).toBe('text');
    expect(vtt!.language).toBe('en');
  });

  it('parses TTML/stpp text track via ContentComponent', async () => {
    mockFetch(TEXT_MPD);
    const { textTracks } = await parser.parse('http://x.com/manifest.mpd');
    const ttml = textTracks.find(t => t.language === 'fr');
    expect(ttml).toBeDefined();
    expect(ttml!.trackType).toBe('text');
  });

  it('parses role attribute on text track', async () => {
    mockFetch(TEXT_MPD);
    const { textTracks } = await parser.parse('http://x.com/manifest.mpd');
    const vtt = textTracks.find(t => t.language === 'en');
    expect(vtt!.role).toBe('subtitle');
  });
});
