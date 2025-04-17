import { SegmentFetcher } from '../dash/SegmentFetcher.js';
import { SegmentTemplateInfo } from '../dash/types.js';
import { SegmentURLGenerator } from '../dash/SegmentURLGenerator.js';
import { logger } from '../utils/Logger.js';

interface TrackBuffer {
  type: 'video' | 'audio';
  mimeType: string;
  generator: SegmentURLGenerator;
  sourceBuffer?: SourceBuffer;
  segmentIndex: number;
}

export class MediaSourceHandler {
  private mediaSource: MediaSource;
  private videoEl: HTMLVideoElement;
  private fetcher: SegmentFetcher;
  private tracks: TrackBuffer[];

  constructor(videoEl: HTMLVideoElement, trackTemplates: SegmentTemplateInfo[]) {
    this.videoEl = videoEl;
    this.fetcher = new SegmentFetcher();
    this.mediaSource = new MediaSource();

    this.tracks = trackTemplates.map(tpl => ({
      type: tpl.media.includes('audio') ? 'audio' : 'video',
      mimeType: tpl.media.includes('audio')
        ? 'audio/mp4; codecs="mp4a.40.2"'
        : 'video/mp4; codecs="avc1.42E01E"',
      generator: new SegmentURLGenerator(tpl),
      segmentIndex: 0,
    }));
  }

  async init() {
    this.videoEl.src = URL.createObjectURL(this.mediaSource);

    this.mediaSource.addEventListener('sourceopen', async () => {
      logger.info('[MediaSourceHandler] MediaSource opened');

      for (const track of this.tracks) {
        track.sourceBuffer = this.mediaSource.addSourceBuffer(track.mimeType);

        const initUrl = track.generator.getInitializationURL();
        const initSeg = await this.fetcher.fetchSegment(initUrl);
        track.sourceBuffer.appendBuffer(initSeg.data);

        track.sourceBuffer.addEventListener('updateend', () => this.appendNextSegment(track));
      }
    });
  }

  private async appendNextSegment(track: TrackBuffer) {
    const url = track.generator.getMediaSegmentURL(track.segmentIndex++);
    logger.debug(`[${track.type}] Fetching segment ${track.segmentIndex - 1}: ${url}`);

    try {
      const seg = await this.fetcher.fetchSegment(url);
      track.sourceBuffer!.appendBuffer(seg.data);
    } catch (err) {
      logger.warn(`[${track.type}] Segment fetch failed:`, err);
    }
  }
}