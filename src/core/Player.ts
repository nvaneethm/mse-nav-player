import { MPDParser } from '../dash/MPDParser.js';
import { MediaSourceHandler } from './MediaSourceHandler.js';
import { logger } from '../utils/Logger.js';
import { SegmentTemplateInfo } from '../dash/types.js';

export class Player {
  private videoElement?: HTMLVideoElement;
  private mediaSourceHandler?: MediaSourceHandler;
  private manifestUrl?: string;

  constructor() {
    logger.setLevel('debug');
  }

  attachVideoElement(video: HTMLVideoElement) {
    this.videoElement = video;
    logger.info('[Player] Video element attached');
  }

  async load(manifestUrl: string) {
    if (!this.videoElement) {
      throw new Error('[Player] No video element attached. Use attachVideoElement().');
    }

    this.manifestUrl = manifestUrl;
    logger.info('[Player] Loading manifest:', manifestUrl);

    const parser = new MPDParser();
    const videoTracks = await parser.parseVideo(manifestUrl);
    const audioTracks = await parser.parseAudio(manifestUrl);
    const tracks: SegmentTemplateInfo[] = [...videoTracks, ...audioTracks];

    this.mediaSourceHandler = new MediaSourceHandler(this.videoElement, tracks);
    await this.mediaSourceHandler.init();
  }

  play() {
    this.videoElement?.play();
  }

  pause() {
    this.videoElement?.pause();
  }

  isPaused(): boolean {
    return this.videoElement?.paused ?? true;
  }

  getCurrentTime(): number {
    return this.videoElement?.currentTime ?? 0;
  }

  seekTo(time: number) {
    if (this.videoElement) {
      this.videoElement.currentTime = time;
    }
  }
}