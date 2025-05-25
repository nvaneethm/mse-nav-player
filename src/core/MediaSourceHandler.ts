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

  async setRendition(resolution: string): Promise<void> {
    const track = this.videoTrackMap[resolution];
    if (!track || this.currentVideoTrack === track) return;

    logger.info(`[MediaSourceHandler] Switching to resolution: ${resolution}`);
    this.currentVideoTrack = track;

    if (!track.sourceBuffer) {
      track.sourceBuffer = this.mediaSource.addSourceBuffer(track.mimeType);
    }

    const initSeg = await this.fetcher.fetchSegment(track.generator.getInitializationURL());
    track.sourceBuffer.appendBuffer(initSeg.data);

    const onUpdateEnd = () => this.appendNextSegment(track);
    track.sourceBuffer.addEventListener("updateend", onUpdateEnd);
    track._onUpdateEnd = onUpdateEnd;

    track.segmentIndex = Math.floor(this.videoEl.currentTime / track.generator.segmentDurationSeconds);
    this.videoEl.currentTime = track.segmentIndex * track.generator.segmentDurationSeconds;
    this.videoEl.play();

    this.appendNextSegment(track);
  }

  private async appendNextSegment(track: TrackBuffer, retryCount = 0): Promise<void> {
    if (!track.sourceBuffer || track.sourceBuffer.updating) return;

    try {
        const url = track.generator.getMediaSegmentURL(track.segmentIndex);
        logger.info(`[appendNextSegment] Appending segment ${track.segmentIndex}: ${url}`);

        const segment = await this.fetcher.fetchSegment(url);
        if (!segment?.data) {
            logger.warn("[appendNextSegment] Segment data is empty or failed to load.");
            if (retryCount < this.MAX_RETRIES) {
                logger.info(`[appendNextSegment] Retrying segment ${track.segmentIndex} (attempt ${retryCount + 1}/${this.MAX_RETRIES})`);
                setTimeout(() => this.appendNextSegment(track, retryCount + 1), this.RETRY_DELAY);
            } else {
                logger.error(`[appendNextSegment] Max retries reached for segment ${track.segmentIndex}, skipping to next segment`);
                track.segmentIndex += 1;
                this.appendNextSegment(track);
            }
            return;
        }

        // Wait for any pending updates to complete
        if (track.sourceBuffer.updating) {
            await new Promise<void>((resolve) => {
                const onUpdateEnd = () => {
                    track.sourceBuffer!.removeEventListener('updateend', onUpdateEnd);
                    resolve();
                };
                track.sourceBuffer!.addEventListener('updateend', onUpdateEnd);
            });
        }

        try {
            track.sourceBuffer.appendBuffer(segment.data);
            track.segmentIndex += 1;
            // Continue appending segments
            this.appendNextSegment(track);
        } catch (appendError) {
            logger.error("[appendNextSegment] Error appending segment to buffer:", appendError);
            if (retryCount < this.MAX_RETRIES) {
                logger.info(`[appendNextSegment] Retrying segment ${track.segmentIndex} (attempt ${retryCount + 1}/${this.MAX_RETRIES})`);
                setTimeout(() => this.appendNextSegment(track, retryCount + 1), this.RETRY_DELAY);
            } else {
                logger.error(`[appendNextSegment] Max retries reached for segment ${track.segmentIndex}, skipping to next segment`);
                track.segmentIndex += 1;
                this.appendNextSegment(track);
            }
        }
    } catch (err) {
        logger.error("[appendNextSegment] Error fetching/append media segment:", err);
        if (retryCount < this.MAX_RETRIES) {
            logger.info(`[appendNextSegment] Retrying segment ${track.segmentIndex} (attempt ${retryCount + 1}/${this.MAX_RETRIES})`);
            setTimeout(() => this.appendNextSegment(track, retryCount + 1), this.RETRY_DELAY);
        } else {
            logger.error(`[appendNextSegment] Max retries reached for segment ${track.segmentIndex}, skipping to next segment`);
            track.segmentIndex += 1;
            this.appendNextSegment(track);
        }
    }
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
  }

  setAdaptiveBitrate(enable: boolean): void {
    logger.info(`[MediaSourceHandler] ABR ${enable ? "enabled" : "disabled"}`);
  }
}