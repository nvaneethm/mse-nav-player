import { SegmentFetcher, SegmentFetchError } from "../dash/SegmentFetcher";
import { SegmentURLGenerator } from "../dash/SegmentURLGenerator";
import { logger } from "../utils/Logger";
import { PlayerEvents } from "../events/PlayerEvents";
import { AD_EVENTS, AD_LOG_MESSAGES } from "../ads/constants";
import { TimelineModel } from "./TimelineModel";
import { EventBus } from "../events/EventBus";
import { Logger } from "../utils/Logger";

interface TrackBuffer {
  type: 'video' | 'audio';
  mimeType: string;
  generator: SegmentURLGenerator;
  sourceBuffer?: SourceBuffer;
  segmentIndex: number;
  _onUpdateEnd?: EventListener;
  ended?: boolean;
}

const removeQueues = new WeakMap<SourceBuffer, Array<[number, number]>>();

function queueRemove(sb: SourceBuffer, start: number, end: number, logger: Logger) {
  let queue = removeQueues.get(sb);
  if (!queue) {
    queue = [];
    removeQueues.set(sb, queue);
  }
  queue.push([start, end]);
  processRemoveQueue(sb, logger);
}

function processRemoveQueue(sb: SourceBuffer, logger: Logger) {
  const queue = removeQueues.get(sb);
  if (!queue || queue.length === 0 || sb.updating) return;
  const next = queue.shift();
  if (!next) return;
  const [start, end] = next;
  sb.remove(start, end);
  logger.debug(`[handleSeeking] (queue) Removed buffer range: ${start} - ${end}`);
  sb.addEventListener('updateend', function handler() {
    sb.removeEventListener('updateend', handler);
    processRemoveQueue(sb, logger);
  });
}

export class MediaSourceHandler {
  private readonly eventBus: EventBus;
  private readonly logger: Logger;
  private readonly mediaSource: MediaSource;
  private readonly videoEl: HTMLVideoElement;
  private readonly segmentFetcher: SegmentFetcher;
  private readonly MAX_BUFFER_SIZE = 30; // seconds
  private readonly MIN_BUFFER_SIZE = 10; // seconds
  private timeline: TimelineModel | null = null;
  private isDestroyed = false;
  private videoTrackMap: Record<string, TrackBuffer>;
  private audioTrack?: TrackBuffer;
  private currentVideoTrack?: TrackBuffer;
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY = 1000;
  private adPlaying = false;
  private pendingTimeouts: Set<ReturnType<typeof setTimeout>> = new Set();

  constructor(videoEl: HTMLVideoElement, mediaSource: MediaSource, fetcher: SegmentFetcher) {
    this.videoEl = videoEl;
    this.mediaSource = mediaSource;
    this.segmentFetcher = fetcher;
    this.videoTrackMap = {};
    this.eventBus = new EventBus();
    this.logger = Logger.getInstance();

    this.mediaSource.addEventListener('sourceopen', () => this.handleSourceOpen());

    // Add timeupdate listener for buffer refill
    this.videoEl.addEventListener('timeupdate', () => this.handleTimeUpdate());

    // Add seeking event handler
    this.videoEl.addEventListener('seeking', () => this.handleSeeking());
  }

  public destroy(): void {
    this.isDestroyed = true;
    this.pendingTimeouts.forEach(timeout => clearTimeout(timeout));
    this.pendingTimeouts.clear();
    this.segmentFetcher.destroy();
    
    // Clean up source buffers
    Object.values(this.videoTrackMap).forEach(track => {
      if (track.sourceBuffer && track._onUpdateEnd) {
        track.sourceBuffer.removeEventListener("updateend", track._onUpdateEnd);
      }
    });
    
    if (this.audioTrack?.sourceBuffer) {
      this.audioTrack.sourceBuffer.removeEventListener("updateend", () => this.appendNextSegment(this.audioTrack!));
    }
  }

  addVideoTrack(res: string, track: TrackBuffer) {
    this.videoTrackMap[res] = track;
  }

  addAudioTrack(track: TrackBuffer) {
    this.audioTrack = track;
  }

  getAvailableRenditions() {
    return Object.entries(this.videoTrackMap).map(([res, track]) => ({
      resolution: res,
      bitrate: track.generator.getInfo().bandwidth || 0,
    }));
  }

  getCurrentBitrate() {
    return this.currentVideoTrack?.generator.getInfo().bandwidth || 0;
  }

  getCurrentResolution() {
    return this.currentVideoTrack?.generator.getInfo().resolution || '';
  }

  async setRendition(resolution: string) {
    const track = this.videoTrackMap[resolution];
    if (!track || this.currentVideoTrack === track) return;

    logger.info(`[MediaSourceHandler] Switching to resolution: ${resolution}`);
    this.currentVideoTrack = track;

    if (!track.sourceBuffer) {
      track.sourceBuffer = this.mediaSource.addSourceBuffer(track.mimeType);
      track.sourceBuffer.addEventListener('error', (e) => {
        logger.error(`[MediaSourceHandler] SourceBuffer error for ${track.type}:`, e);
        track.ended = true;
        this.tryEndOfStream();
      });
    }

    const initSeg = await this.segmentFetcher.fetchSegment(track.generator.getInitializationURL());
    track.sourceBuffer.appendBuffer(initSeg.data);

    const onUpdateEnd = () => this.appendNextSegment(track);
    track.sourceBuffer.addEventListener("updateend", onUpdateEnd);
    track._onUpdateEnd = onUpdateEnd;

    track.segmentIndex = Math.floor(this.videoEl.currentTime / track.generator.segmentDurationSeconds);
    this.videoEl.currentTime = track.segmentIndex * track.generator.segmentDurationSeconds;
    this.videoEl.play();

    this.appendNextSegment(track);

    if (this.audioTrack && !this.audioTrack.sourceBuffer) {
      this.audioTrack.sourceBuffer = this.mediaSource.addSourceBuffer(this.audioTrack.mimeType);
      this.audioTrack.sourceBuffer.addEventListener('error', (e) => {
        logger.error(`[MediaSourceHandler] SourceBuffer error for audio:`, e);
        this.audioTrack!.ended = true;
        this.tryEndOfStream();
      });
    }
  }

  private async appendNextSegment(track: TrackBuffer, retryCount = 0): Promise<void> {
    if (this.isDestroyed || this.adPlaying || track.ended) {
      logger.info(`[appendNextSegment] Skipped: ad is playing, handler destroyed, or track ended`);
      return;
    }

    if (!track.sourceBuffer || track.sourceBuffer.updating) return;

    const maxIndex = track.generator.getLastSegmentIndex();
    if (track.segmentIndex > maxIndex) {
      logger.info(`[appendNextSegment] Reached end of stream for ${track.type}`);
      track.ended = true;
      this.tryEndOfStream();
      return;
    }

    // Check buffer size and only fetch if buffer ahead is less than MAX_BUFFER_SIZE
    let bufferAhead = 0;
    if (track.sourceBuffer.buffered.length > 0) {
      const bufferedEnd = track.sourceBuffer.buffered.end(track.sourceBuffer.buffered.length - 1);
      bufferAhead = bufferedEnd - this.videoEl.currentTime;
      if (bufferAhead > this.MAX_BUFFER_SIZE) {
        logger.debug(`[appendNextSegment] Buffer ahead (${bufferAhead}s) exceeds MAX_BUFFER_SIZE, not fetching more.`);
        // Wait for updateend event to try again
        return;
      }
    }

    try {
      const url = track.generator.getMediaSegmentURL(track.segmentIndex);
      logger.info(`[appendNextSegment] Appending segment ${track.segmentIndex}: ${url}`);
      const segment = await this.segmentFetcher.fetchSegment(url);

      if (!segment?.data) throw new Error("Empty segment");

      if (track.sourceBuffer.updating) {
        await new Promise<void>((resolve) => {
          const onUpdateEnd = () => {
            if (this.isDestroyed) return;
            track.sourceBuffer!.removeEventListener("updateend", onUpdateEnd);
            resolve();
          };
          track.sourceBuffer!.addEventListener("updateend", onUpdateEnd);
        });
      }

      if (this.isDestroyed) return;

      track.sourceBuffer.appendBuffer(segment.data);
      track.segmentIndex += 1;
      // Do NOT schedule next append here; rely on updateend event
    } catch (err) {
      if (err instanceof SegmentFetchError) {
        logger.error(`[appendNextSegment] Fetch error for segment ${track.segmentIndex}:`, {
          url: err.url,
          status: err.status,
          message: err.message
        });
      } else {
        logger.error("[appendNextSegment] Error fetching/append media segment:", err);
      }

      if (retryCount + 1 < this.MAX_RETRIES) {
        logger.warn(`[appendNextSegment] Retrying segment ${track.segmentIndex} (attempt ${retryCount + 1}/${this.MAX_RETRIES})`);
        const timeout = setTimeout(() => {
          this.pendingTimeouts.delete(timeout);
          this.appendNextSegment(track, retryCount + 1);
        }, this.RETRY_DELAY);
        this.pendingTimeouts.add(timeout);
      } else {
        logger.error(`[appendNextSegment] Skipping segment ${track.segmentIndex} after max retries`);
        track.segmentIndex += 1;
        if (track.segmentIndex > maxIndex) {
          track.ended = true;
          this.tryEndOfStream();
          return;
        }
        // Wait for updateend event to try again
      }
    }
  }

  private tryEndOfStream() {
    const allEnded = [this.currentVideoTrack, this.audioTrack]
      .filter(Boolean)
      .every(track => track!.ended);
    if (allEnded && this.mediaSource.readyState === 'open') {
      logger.info('[MediaSourceHandler] All tracks ended, signaling endOfStream');
      try {
        this.mediaSource.endOfStream();
      } catch (err) {
        logger.warn('[MediaSourceHandler] endOfStream error:', err);
      }
    }
  }

  async init() {
    logger.info("[MediaSourceHandler] Initializing");

    if (this.mediaSource.readyState !== "open") {
      await new Promise<void>((resolve) => {
        const onOpen = () => {
          this.mediaSource.removeEventListener("sourceopen", onOpen);
          resolve();
        };
        this.mediaSource.addEventListener("sourceopen", onOpen);
      });
    }

    if (this.audioTrack) {
      const initSeg = await this.segmentFetcher.fetchSegment(this.audioTrack.generator.getInitializationURL());
      this.audioTrack.sourceBuffer = this.mediaSource.addSourceBuffer(this.audioTrack.mimeType);
      this.audioTrack.sourceBuffer.appendBuffer(initSeg.data);
      this.audioTrack.sourceBuffer.addEventListener("updateend", () => this.appendNextSegment(this.audioTrack!));
    }

    const renditions = this.getAvailableRenditions();
    if (renditions.length > 0) {
      await this.setRendition(renditions[0].resolution);
    }
  }

  setAdaptiveBitrate(enable: boolean) {
    logger.info(`[MediaSourceHandler] ABR ${enable ? "enabled" : "disabled"}`);
  }

  async appendAdBuffer(buffer: ArrayBuffer): Promise<void> {
    const sb = this.currentVideoTrack?.sourceBuffer;
    if (!sb) return;

    if (sb.updating) {
      await new Promise<void>((res) => {
        const done = () => {
          sb.removeEventListener("updateend", done);
          res();
        };
        sb.addEventListener("updateend", done);
      });
    }

    try {
      sb.remove(0, this.videoEl.duration);
      await new Promise<void>((res) => {
        const done = () => {
          sb.removeEventListener("updateend", done);
          res();
        };
        sb.addEventListener("updateend", done);
      });

      sb.appendBuffer(buffer);
    } catch (err) {
      logger.error("[appendAdBuffer] Failed to append:", err);
    }
  }

  public registerEventBus(eventBus: PlayerEvents) {
    eventBus.on(AD_EVENTS.START, () => {
      this.adPlaying = true;
      logger.info(AD_LOG_MESSAGES.AD_STARTED);
    });

    eventBus.on(AD_EVENTS.END, () => {
      this.adPlaying = false;
      logger.info(AD_LOG_MESSAGES.AD_ENDED);
    });
  }

  private handleSourceOpen() {
    this.logger.debug('MediaSource opened');
    this.isDestroyed = false;
    this.eventBus.emit('ready');
  }

  /**
   * Sets the timeline for the media source
   * @param timeline The timeline to set
   */
  public setTimeline(timeline: TimelineModel) {
    if (this.isDestroyed) {
      throw new Error('Cannot set timeline on destroyed MediaSourceHandler');
    }

    this.timeline = timeline;
    logger.debug('Timeline set', { segmentCount: timeline.getSegmentCount() });
  }

  /**
   * Gets the current timeline
   * @returns The current timeline
   */
  public getTimeline(): TimelineModel | null {
    if (this.isDestroyed) {
      throw new Error('Cannot get timeline from destroyed MediaSourceHandler');
    }

    return this.timeline;
  }

  private handleTimeUpdate() {
    // Check all tracks (video and audio)
    const tracks: TrackBuffer[] = [this.currentVideoTrack, this.audioTrack].filter(Boolean) as TrackBuffer[];
    for (const track of tracks) {
      if (!track.sourceBuffer || track.ended) continue;
      let bufferAhead = 0;
      if (track.sourceBuffer.buffered.length > 0) {
        const bufferedEnd = track.sourceBuffer.buffered.end(track.sourceBuffer.buffered.length - 1);
        bufferAhead = bufferedEnd - this.videoEl.currentTime;
      }
      if (bufferAhead < this.MIN_BUFFER_SIZE && !track.sourceBuffer.updating) {
        this.appendNextSegment(track);
      }
    }
  }

  private handleSeeking() {
    const SEEK_WINDOW = 1; // seconds to keep around currentTime
    const currentTime = this.videoEl.currentTime;
    const tracks: TrackBuffer[] = [this.currentVideoTrack, this.audioTrack].filter(Boolean) as TrackBuffer[];
    for (const track of tracks) {
      if (!track.sourceBuffer) continue;
      // Remove all buffered data except a small window around currentTime
      for (let i = 0; i < track.sourceBuffer.buffered.length; i++) {
        const start = track.sourceBuffer.buffered.start(i);
        const end = track.sourceBuffer.buffered.end(i);
        if (end < currentTime - SEEK_WINDOW || start > currentTime + SEEK_WINDOW) {
          try {
            queueRemove(track.sourceBuffer, start, end, this.logger);
          } catch (err) {
            this.logger.warn('[handleSeeking] Failed to queue buffer remove:', err);
          }
        }
      }
      // Update segmentIndex to match the new currentTime, clamped to valid range
      const segIdx = Math.floor(currentTime / track.generator.segmentDurationSeconds);
      const maxIdx = track.generator.getLastSegmentIndex();
      track.segmentIndex = Math.max(0, Math.min(segIdx, maxIdx));
      track.ended = false;
    }
    // Trigger immediate re-buffering
    for (const track of tracks) {
      if (!track.sourceBuffer?.updating) {
        this.appendNextSegment(track);
      }
    }
  }
}