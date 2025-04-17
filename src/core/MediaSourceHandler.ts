import { SegmentFetcher } from '../dash/SegmentFetcher.js';
import { SegmentURLGenerator } from '../dash/SegmentURLGenerator.js';
import { logger } from '../utils/Logger.js';

export class MediaSourceHandler {
  private mediaSource: MediaSource;
  private sourceBuffer!: SourceBuffer;
  private videoEl: HTMLVideoElement;
  private generator: SegmentURLGenerator;
  private fetcher: SegmentFetcher;
  private mimeType: string = 'video/mp4; codecs="avc1.42E01E"'; // Update based on real codec if needed
  private segmentIndex = 0;

  constructor(videoElement: HTMLVideoElement, generator: SegmentURLGenerator) {
    this.videoEl = videoElement;
    this.generator = generator;
    this.fetcher = new SegmentFetcher();
    this.mediaSource = new MediaSource();
  }

  async init() {
    logger.info('[MediaSourceHandler] Initializing MSE');

    this.videoEl.src = URL.createObjectURL(this.mediaSource);

    this.mediaSource.addEventListener('sourceopen', async () => {
      try {
        this.sourceBuffer = this.mediaSource.addSourceBuffer(this.mimeType);

        // 1. Init segment
        const initURL = this.generator.getInitializationURL();
        const initSeg = await this.fetcher.fetchSegment(initURL);
        this.sourceBuffer.appendBuffer(initSeg.data);
        logger.debug('[MediaSourceHandler] Init segment appended');

        // 2. Media segments
        this.sourceBuffer.addEventListener('updateend', this.appendNextSegment);
      } catch (e) {
        logger.error('[MediaSourceHandler] Error during MSE init:', e);
      }
    });
  }

  private appendNextSegment = async () => {
    const url = this.generator.getMediaSegmentURL(this.segmentIndex++);
    logger.debug(`[MediaSourceHandler] Fetching segment ${this.segmentIndex - 1}: ${url}`);

    try {
      const segment = await this.fetcher.fetchSegment(url);
      this.sourceBuffer.appendBuffer(segment.data);
    } catch (e) {
      logger.warn('[MediaSourceHandler] Failed to fetch segment:', url, e);
    }
  };
}