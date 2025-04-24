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
  private audioTrack?: TrackBuffer;
  private currentVideoTrack?: TrackBuffer;
  private videoTrackMap: Record<string, TrackBuffer> = {};

  constructor(videoEl: HTMLVideoElement, trackTemplates: SegmentTemplateInfo[]) {
    this.videoEl = videoEl;
    this.fetcher = new SegmentFetcher();
    this.mediaSource = new MediaSource();

    for (const tpl of trackTemplates) {
      const type: 'video' | 'audio' = tpl.media.includes('audio') ? 'audio' : 'video';
      const track: TrackBuffer = {
        type,
        mimeType: `${tpl.mimeType}; codecs="${tpl.codecs}"`,
        generator: new SegmentURLGenerator(tpl),
        segmentIndex: 0,
      };

      if (type === 'audio' && !this.audioTrack) {
        this.audioTrack = track;
      } else if (type === 'video' && tpl.resolution) {
        this.videoTrackMap[tpl.resolution] = track;
      }
    }
  }


  async init() {
    this.videoEl.src = URL.createObjectURL(this.mediaSource);

    this.mediaSource.addEventListener('sourceopen', async () => {
      logger.info('[MediaSourceHandler] MediaSource opened');

      if (this.audioTrack) {
        this.audioTrack.sourceBuffer = this.mediaSource.addSourceBuffer(this.audioTrack.mimeType);
        const initSeg = await this.fetcher.fetchSegment(this.audioTrack.generator.getInitializationURL());
        this.audioTrack.sourceBuffer.appendBuffer(initSeg.data);
        this.audioTrack.sourceBuffer.addEventListener('updateend', () => this.appendNextSegment(this.audioTrack!));
      }

      const defaultRes = Object.keys(this.videoTrackMap)[0]; // First available
      if (defaultRes) {
        await this.setRendition(defaultRes);
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

  getCurrentBitrate(): number {
    return this.currentVideoTrack?.generator.getInfo().bandwidth ?? 0;
  }

  getCurrentResolution(): string {
    return `${this.videoEl.videoWidth}x${this.videoEl.videoHeight}`;
  }

  getAvailableRenditions(): { resolution: string; bitrate: number }[] {
    return Object.entries(this.videoTrackMap)
      .map(([resolution, track]) => {
        const bandwidth = track.generator.getInfo().bandwidth ?? 0;
        return { resolution, bitrate: bandwidth };
      })
      .sort((a, b) => a.bitrate - b.bitrate);
  }

  async setRendition(resolution: string): Promise<void> {
    const track = this.videoTrackMap[resolution];
    if (!track) {
      logger.warn(`[MediaSourceHandler] No track found for resolution: ${resolution}`);
      return;
    }

    logger.info(`[MediaSourceHandler] Switching to resolution: ${resolution}`);
    this.currentVideoTrack = track;

    track.sourceBuffer = this.mediaSource.addSourceBuffer(track.mimeType);
    const initSeg = await this.fetcher.fetchSegment(track.generator.getInitializationURL());
    track.sourceBuffer.appendBuffer(initSeg.data);
    track.sourceBuffer.addEventListener('updateend', () => this.appendNextSegment(track));
  }

  setAdaptiveBitrate(enable: boolean): void {
    logger.info(`[MediaSourceHandler] Adaptive Bitrate ${enable ? 'enabled' : 'disabled'} (stub)`);
  }

}