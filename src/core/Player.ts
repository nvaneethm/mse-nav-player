import { MPDParser } from '../dash/MPDParser.js';
import { MediaSourceHandler } from './MediaSourceHandler.js';
import { logger } from '../utils/Logger.js';
import { SegmentTemplateInfo } from '../dash/types.js';

type PlayerEventHook = () => void;
type ErrorHook = (err: unknown) => void;

export class Player {
  private videoElement?: HTMLVideoElement;
  private mediaSourceHandler?: MediaSourceHandler;
  private manifestUrl?: string;

  public onPlay?: PlayerEventHook;
  public onPause?: PlayerEventHook;
  public onEnded?: PlayerEventHook;
  public onReady?: PlayerEventHook;
  public onError?: ErrorHook;

  constructor() {
    logger.setLevel('debug');
  }

  attachVideoElement(video: HTMLVideoElement) {
    this.videoElement = video;

    this.videoElement.onplay = () => this.onPlay?.();
    this.videoElement.onpause = () => this.onPause?.();
    this.videoElement.onended = () => this.onEnded?.();
    this.videoElement.onerror = () => this.onError?.(this.videoElement?.error);
    logger.info('[Player] Video element attached');
  }

  async load(manifestUrl: string) {
    if (!this.videoElement) {
      throw new Error('[Player] No video element attached. Use attachVideoElement().');
    }

    this.manifestUrl = manifestUrl;
    logger.info('[Player] Loading manifest:', manifestUrl);

    try {
      const parser = new MPDParser();
      const videoTracks = await parser.parseVideo(manifestUrl);
      const audioTracks = await parser.parseAudio(manifestUrl);
      const tracks: SegmentTemplateInfo[] = [...videoTracks, ...audioTracks];

      this.mediaSourceHandler = new MediaSourceHandler(this.videoElement, tracks);
      await this.mediaSourceHandler.init();

      this.onReady?.();
    } catch (err) {
      logger.error('[Player] Error during load:', err);
      this.onError?.(err);
    }
  }

  play() {
    this.videoElement?.play().catch(err => {
      logger.error('[Player] Play error:', err);
      this.onError?.(err);
    });
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

  reset() {
    if (this.videoElement) {
      this.videoElement.pause();
      this.videoElement.removeAttribute('src');
      this.videoElement.load();
    }

    this.mediaSourceHandler = undefined;
    this.manifestUrl = undefined;

    logger.info('[Player] Reset complete');
  }

  destroy() {
    this.reset();
    this.videoElement = undefined;

    logger.info('[Player] Destroyed player');
  }
}