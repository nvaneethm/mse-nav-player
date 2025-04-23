import SegmentFetcher from '../utils/SegmentFetcher.js';
import { SegmentURLGenerator } from '../dash/SegmentURLGenerator.js';
import { logger } from '../utils/Logger.js';
import { SegmentTemplateInfo } from './types.js';

interface TrackBuffer {
  type: 'video' | 'audio';
  mimeType: string;
  generator: SegmentURLGenerator;
  sourceBuffer?: SourceBuffer;
  segmentIndex: number;
  initializationAppended: boolean;
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
      mimeType: tpl.mimeType || 'video/mp4', // fallback
      generator: new SegmentURLGenerator(tpl),
      segmentIndex: 0,
      initializationAppended: false,
    }));
  }

  async init() {
    this.videoEl.src = URL.createObjectURL(this.mediaSource);

    this.mediaSource.addEventListener('sourceopen', async () => {
      logger.info('[MediaSourceHandler] MediaSource opened');

      for (const track of this.tracks) {
        track.sourceBuffer = this.mediaSource.addSourceBuffer(track.mimeType);

        track.sourceBuffer.addEventListener('updateend', () => this.appendNextSegment(track));

        await this.appendInitializationSegment(track);
      }
    });
  }

  private async appendInitializationSegment(track: TrackBuffer) {
    if (track.initializationAppended) return;

    const initUrl = track.generator.getInitializationURL?.();
    if (initUrl) {
      logger.debug(`[${track.type}] Fetching init segment: ${initUrl}`);
      const initSeg = await this.fetcher.fetchSegment(initUrl);
      track.sourceBuffer!.appendBuffer(initSeg.data);
      track.initializationAppended = true;
    }
  }

  private async appendNextSegment(track: TrackBuffer) {
    if (!track.initializationAppended) return; // Wait until init segment is appended

    const url = track.generator.getMediaSegmentURL(track.segmentIndex++);
    if (!url) {
      logger.info(`[${track.type}] No more segments to fetch.`);
      return;
    }

    logger.debug(`[${track.type}] Fetching segment: ${url}`);

    try {
      const seg = await this.fetcher.fetchSegment(url);
      track.sourceBuffer!.appendBuffer(seg.data);
    } catch (err) {
      logger.warn(`[${track.type}] Segment fetch failed:`, err);
    }
  }
}