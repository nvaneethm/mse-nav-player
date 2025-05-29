import { SegmentFetcher } from "../dash/SegmentFetcher";
import { SegmentURLGenerator } from "../dash/SegmentURLGenerator";
import { logger } from "../utils/Logger";

interface TrackBuffer {
  type: 'video' | 'audio';
  mimeType: string;
  generator: SegmentURLGenerator;
  sourceBuffer?: SourceBuffer;
  segmentIndex: number;
   _onUpdateEnd?: EventListener;

}

export class MediaSourceHandler {
  private videoEl: HTMLVideoElement;
  private mediaSource: MediaSource;
  private fetcher: SegmentFetcher;
  private videoTrackMap: Record<string, TrackBuffer>;
  private audioTrack?: TrackBuffer;
  private currentVideoTrack?: TrackBuffer;
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY = 1000; // 1 second
  private BUFFER_AHEAD_THRESHOLD = 40; // seconds to keep buffered ahead (increased)
  private bufferMonitorInterval?: number;
  private fillBufferRunning: WeakMap<TrackBuffer, boolean> = new WeakMap();

  constructor(videoEl: HTMLVideoElement, mediaSource: MediaSource, fetcher: SegmentFetcher) {
    this.videoEl = videoEl;
    this.mediaSource = mediaSource;
    this.fetcher = fetcher;
    this.videoTrackMap = {};
  }

  addVideoTrack(resolution: string, track: TrackBuffer): void {
    this.videoTrackMap[resolution] = track;
  }

  addAudioTrack(track: TrackBuffer): void {
    this.audioTrack = track;
  }

  getAvailableRenditions(): { resolution: string; bitrate: number }[] {
    return Object.entries(this.videoTrackMap).map(([resolution, track]) => ({
      resolution,
      bitrate: track.generator.getInfo().bandwidth ?? 0, // <- Fallback if undefined
    }));
  }

  getCurrentBitrate(): number {
    return this.currentVideoTrack?.generator.getInfo().bandwidth || 0;
  }

  getCurrentResolution(): string {
    return this.currentVideoTrack?.generator.getInfo().resolution || "";
  }

  private getBufferEnd(track: TrackBuffer): number {
    if (!track.sourceBuffer || track.sourceBuffer.buffered.length === 0) return this.videoEl.currentTime;
    return track.sourceBuffer.buffered.end(track.sourceBuffer.buffered.length - 1);
  }

  private getBufferAhead(track: TrackBuffer): number {
    return this.getBufferEnd(track) - this.videoEl.currentTime;
  }

  // Utility to log buffer state for both tracks
  private logBufferState(context: string) {
    const logTrack = (label: string, track?: TrackBuffer) => {
      if (!track || !track.sourceBuffer) return;
      let ranges = [];
      for (let i = 0; i < track.sourceBuffer.buffered.length; i++) {
        ranges.push(`[${track.sourceBuffer.buffered.start(i).toFixed(2)}, ${track.sourceBuffer.buffered.end(i).toFixed(2)}]`);
      }
      logger.debug(`[${context}] ${label} segmentIndex: ${track.segmentIndex}, buffered: ${ranges.join(' ')}`);
    };
    logger.debug(`[${context}] videoEl.currentTime: ${this.videoEl.currentTime.toFixed(2)}`);
    logTrack('Video', this.currentVideoTrack);
    logTrack('Audio', this.audioTrack);
  }

  private async fillBuffer(track: TrackBuffer) {
    if (this.fillBufferRunning.get(track)) {
      return;
    }
    this.fillBufferRunning.set(track, true);
    try {
      this.logBufferState('fillBuffer-start');
      while (
        this.getBufferAhead(track) < this.BUFFER_AHEAD_THRESHOLD &&
        !track.sourceBuffer?.updating
      ) {
        logger.debug(`[fillBuffer] Buffer ahead: ${this.getBufferAhead(track).toFixed(2)}s, segmentIndex: ${track.segmentIndex}`);
        await this.appendNextSegment(track);
        if (track.sourceBuffer?.updating) {
          await new Promise<void>((resolve) => {
            const onUpdateEnd = () => {
              track.sourceBuffer!.removeEventListener('updateend', onUpdateEnd);
              resolve();
            };
            track.sourceBuffer!.addEventListener('updateend', onUpdateEnd);
          });
        }
      }
      this.logBufferState('fillBuffer-end');
      logger.debug(`[fillBuffer] Done filling. Buffer ahead: ${this.getBufferAhead(track).toFixed(2)}s, segmentIndex: ${track.segmentIndex}`);
    } finally {
      this.fillBufferRunning.set(track, false);
    }
  }

  async setRendition(resolution: string): Promise<void> {
    const track = this.videoTrackMap[resolution];
    if (!track || this.currentVideoTrack === track) return;

    const info = track.generator.getInfo();
    logger.info(`[MediaSourceHandler] Switching to resolution: ${resolution}, bitrate: ${info.bandwidth}bps`);

    // Reuse the existing SourceBuffer for video
    if (!this.currentVideoTrack?.sourceBuffer) {
      // First time: create SourceBuffer
      track.sourceBuffer = this.mediaSource.addSourceBuffer(track.mimeType);
    } else {
      // Reuse the existing SourceBuffer
      track.sourceBuffer = this.currentVideoTrack.sourceBuffer;
    }

    // Remove any previous updateend listeners
    if (track._onUpdateEnd) {
      track.sourceBuffer.removeEventListener('updateend', track._onUpdateEnd);
    }

    // Clear buffer before switching
    if (track.sourceBuffer.buffered.length > 0 && !track.sourceBuffer.updating) {
      const start = track.sourceBuffer.buffered.start(0);
      const end = track.sourceBuffer.buffered.end(track.sourceBuffer.buffered.length - 1);
      await new Promise<void>((resolve) => {
        const handler = () => {
          track.sourceBuffer!.removeEventListener('updateend', handler);
          resolve();
        };
        track.sourceBuffer!.addEventListener('updateend', handler);
        track.sourceBuffer!.remove(start, end);
      });
    }

    // Set segmentIndex based on current time, seek to segment start
    const currentTime = this.videoEl.currentTime;
    track.segmentIndex = Math.floor(currentTime / track.generator.segmentDurationSeconds);
    const seekTime = track.segmentIndex * track.generator.segmentDurationSeconds;

    // Append init segment
    const initSeg = await this.fetcher.fetchSegment(track.generator.getInitializationURL());
    // Wait for any pending updates before appending
    if (track.sourceBuffer.updating) {
      await new Promise<void>((resolve) => {
        const onUpdateEnd = () => {
          track.sourceBuffer!.removeEventListener('updateend', onUpdateEnd);
          resolve();
        };
        track.sourceBuffer!.addEventListener('updateend', onUpdateEnd);
      });
    }
    track.sourceBuffer.appendBuffer(initSeg.data);

    // Set up segment appending
    const onUpdateEnd = () => this.appendNextSegment(track);
    track.sourceBuffer.addEventListener('updateend', onUpdateEnd);
    track._onUpdateEnd = onUpdateEnd;

    this.currentVideoTrack = track;

    // Seek to the start of the segment to ensure a keyframe is present
    this.videoEl.currentTime = seekTime;

    // Prefetch several segments immediately to avoid initial stalls
    for (let i = 0; i < 5; i++) {
      await this.appendNextSegment(track);
      if (track.sourceBuffer.updating) {
        await new Promise<void>((resolve) => {
          const onUpdateEnd = () => {
            track.sourceBuffer!.removeEventListener('updateend', onUpdateEnd);
            resolve();
          };
          track.sourceBuffer!.addEventListener('updateend', onUpdateEnd);
        });
      }
    }
  }

  private async appendNextSegment(track: TrackBuffer, retryCount = 0): Promise<void> {
    this.logBufferState('appendNextSegment-start');
    if (!track.sourceBuffer || track.sourceBuffer.updating) return;
    if (this.getBufferAhead(track) > this.BUFFER_AHEAD_THRESHOLD) {
      return;
    }
    try {
        const url = track.generator.getMediaSegmentURL(track.segmentIndex);
        logger.info(`[appendNextSegment] Fetching segment for resolution: ${track.generator.getInfo().resolution}, bitrate: ${track.generator.getInfo().bandwidth}bps, index: ${track.segmentIndex}, url: ${url}`);
        const segment = await this.fetcher.fetchSegment(url);
        if (!segment?.data) {
            logger.warn("[appendNextSegment] Segment data is empty or failed to load.");
            if (retryCount < this.MAX_RETRIES) {
                logger.info(`[appendNextSegment] Retrying segment ${track.segmentIndex} (attempt ${retryCount + 1}/${this.MAX_RETRIES})`);
                return;
            } else {
                logger.error(`[appendNextSegment] Max retries reached for segment ${track.segmentIndex}, skipping to next segment`);
                track.segmentIndex += 1;
                return;
            }
        }
        // Buffer cleanup: remove old data to prevent QuotaExceededError
        // const BUFFER_BACK_WINDOW = 30;
        // if (track.sourceBuffer.buffered.length > 0) {
        //     const currentTime = this.videoEl.currentTime;
        //     const removeEnd = currentTime - BUFFER_BACK_WINDOW;
        //     if (removeEnd > 0 && !track.sourceBuffer.updating) {
        //         this.logBufferState('buffer-cleanup-before');
        //         try {
        //             track.sourceBuffer.remove(0, removeEnd);
        //         } catch (e) {
        //             logger.warn('[appendNextSegment] Error while cleaning buffer:', e);
        //         }
        //         this.logBufferState('buffer-cleanup-after');
        //     }
        // }
        if (track.sourceBuffer.updating) return;
        try {
            track.sourceBuffer.appendBuffer(segment.data);
            track.segmentIndex += 1;
        } catch (appendError) {
            logger.error("[appendNextSegment] Error appending segment to buffer:", appendError);
        }
    } catch (err) {
        logger.error("[appendNextSegment] Error fetching/append media segment:", err);
    }
    this.logBufferState('appendNextSegment-end');
  }

  async init(): Promise<void> {
    logger.info("[MediaSourceHandler] Initializing MediaSourceHandler");
    
    // Wait for MediaSource to be ready
    if (this.mediaSource.readyState !== 'open') {
      await new Promise<void>((resolve) => {
        const onSourceOpen = () => {
          this.mediaSource.removeEventListener('sourceopen', onSourceOpen);
          resolve();
        };
        this.mediaSource.addEventListener('sourceopen', onSourceOpen);
      });
    }

    // Initialize audio track first
    if (this.audioTrack) {
      logger.info("[MediaSourceHandler] Initializing audio track");
      this.audioTrack.sourceBuffer = this.mediaSource.addSourceBuffer(this.audioTrack.mimeType);
      const initSeg = await this.fetcher.fetchSegment(this.audioTrack.generator.getInitializationURL());
      this.audioTrack.sourceBuffer.appendBuffer(initSeg.data);
      this.audioTrack.sourceBuffer.addEventListener("updateend", () => this.appendNextSegment(this.audioTrack!));
    }

    // Set initial video rendition
    const renditions = this.getAvailableRenditions();
    if (renditions.length > 0) {
      const initialRendition = renditions[0].resolution;
      await this.setRendition(initialRendition);
    }
    // Start buffer monitor
    this.startBufferMonitor();
  }

  private startBufferMonitor() {
    if (this.bufferMonitorInterval) clearInterval(this.bufferMonitorInterval);
    this.bufferMonitorInterval = window.setInterval(() => {
      if (this.currentVideoTrack) {
        this.fillBuffer(this.currentVideoTrack);
      }
      if (this.audioTrack) {
        this.fillBuffer(this.audioTrack);
      }
    }, 500); // Check every 500ms (decreased)
  }

  setAdaptiveBitrate(enable: boolean): void {
    logger.info(`[MediaSourceHandler] ABR ${enable ? "enabled" : "disabled"}`);
  }
}