/**
 * @fileoverview The Player class provides a simple interface to load,
 * control, and destroy DASH-based video playback using Media Source Extensions.
 * It supports event hooks, volume controls, and resolution switching.
 */

import { MPDParser } from '../dash/MPDParser.js';
import { MediaSourceHandler } from './MediaSourceHandler.js';
import { logger } from '../utils/Logger.js';
import { TimelineSegment } from '../types/timeline.js';
import { SegmentFetcher } from '../dash/SegmentFetcher.js';
import { SegmentURLGenerator } from '../dash/SegmentURLGenerator.js';
import { TimelineModel as TimelineModelClass } from './TimelineModel.js';
import { PlayerEvents } from '../events/PlayerEvents.js';
import { AdManager, AdConfig } from '../ads/AdManager.js';
import { EventBus } from '../events/EventBus';
import { PlayerEventType } from '../events/PlayerEvents';
import { LogLevel } from '../utils/Logger';
import { SegmentTemplateInfo } from '../dash/types';

/**
 * Callback type for general player events.
 */
type PlayerEventHook = () => void;
/**
 * Callback type for error events.
 */
type ErrorHook = (err: unknown) => void;
/**
 * Callback for time updates.
 */
type TimeUpdateHook = (time: number) => void;

export class PlayerError extends Error {
    constructor(
        message: string,
        public readonly cause?: unknown
    ) {
        super(message);
        this.name = 'PlayerError';
    }
}

/**
 * The Player class abstracts a complete video playback controller built over
 * Media Source Extensions (MSE) and custom DASH parsing logic.
 */
export class Player {
    private videoElement: HTMLVideoElement | null = null;
    private mediaSourceHandler!: MediaSourceHandler;
    private manifestUrl?: string;
    private mediaSource?: MediaSource;
    private segmentFetcher: SegmentFetcher;
    private timelineModel: TimelineModelClass | null = null;
    private currentSegment?: TimelineSegment;
    private events: PlayerEvents;
    private adManager: AdManager;
    private isDestroyed: boolean = false;
    private pendingOperations: Set<Promise<unknown>> = new Set();
    private readonly eventBus: EventBus;
    private readonly mpdParser: MPDParser;
    private readonly MAX_BUFFER_SIZE = 30; // 30 seconds
    private readonly MIN_BUFFER_SIZE = 5; // 5 seconds
    private readonly MAX_RETRY_ATTEMPTS = 3;
    private readonly RETRY_DELAY = 1000; // 1 second
    private retryCount: number = 0;
    private lastError: Error | null = null;
    private isPlayerInitialized: boolean = false;

    /**
    * Hook called when playback starts.
    */
    public onPlay?: PlayerEventHook;
    /**
    * Hook called when playback is paused.
    */
    public onPause?: PlayerEventHook;
    /**
    * Hook called when playback ends.
    */
    public onEnded?: PlayerEventHook;
    /**
    * Hook called when manifest and tracks are successfully loaded.
    */
    public onReady?: PlayerEventHook;
    /**
    * Hook called when an error occurs.
    */
    public onError?: ErrorHook;
    /**
    * Hook called when playback time updates.
    */
    public onTimeUpdate?: TimeUpdateHook;
    /**
    * Hook called when playback is buffering.
    */
    public onBuffering?: PlayerEventHook;

    constructor() {
        logger.setLevel(LogLevel.DEBUG);
        this.events = new PlayerEvents();
        this.events.onPlay(() => this.onPlay?.());
        this.events.onPause(() => this.onPause?.());
        this.events.onEnded(() => this.onEnded?.());
        this.events.onReady(() => this.onReady?.());
        this.events.onError((error) => this.onError?.(error));
        this.events.onTimeUpdate((time) => this.onTimeUpdate?.(time));
        this.events.onBuffering(() => this.onBuffering?.());
        this.adManager = new AdManager(this.events);
        this.eventBus = new EventBus();
        this.mpdParser = new MPDParser();
        this.segmentFetcher = new SegmentFetcher();
        this.setupEventListeners();
        logger.debug('[Player] Initialized');
    }

    private setupEventListeners(): void {
        this.eventBus.on(PlayerEventType.ERROR, this.handleError.bind(this));
        this.eventBus.on(PlayerEventType.SEGMENT_LOADED, this.handleSegmentLoaded.bind(this));
        this.eventBus.on(PlayerEventType.SEGMENT_ERROR, this.handleSegmentError.bind(this));
    }

    /**
      * Attaches the given HTML video element to the player.
      * Registers internal event listeners for playback hooks.
      * @param video - HTMLVideoElement to attach.
      */
    public async attachVideoElement(video: HTMLVideoElement): Promise<void> {
        if (this.isDestroyed) {
            throw new PlayerError('Player is destroyed');
        }
        if (!(video instanceof HTMLVideoElement)) {
            throw new PlayerError('Invalid video element');
        }
        this.videoElement = video;
        this.isPlayerInitialized = true;
        logger.info('[Player] Video element attached');
    }
    /**
       * Loads a DASH manifest and initializes playback.
       * @param manifestUrl - URL to the MPD manifest.
       */
    public async load(manifestUrl: string): Promise<void> {
        if (this.isDestroyed) {
            throw new PlayerError('Player is destroyed');
        }

        if (!this.isPlayerInitialized) {
            throw new PlayerError('Player not initialized');
        }

        if (!this.videoElement) {
            throw new PlayerError('No video element attached');
        }

        try {
            const loadPromise = this.loadManifest(manifestUrl);
            this.pendingOperations.add(loadPromise);
            await loadPromise;
            this.pendingOperations.delete(loadPromise);
        } catch (err) {
            this.handleError(err);
            throw new PlayerError('Failed to load manifest', err);
        }
    }

    private async loadManifest(manifestUrl: string): Promise<void> {
        try {
            const { videoTracks, audioTracks } = await this.mpdParser.parse(manifestUrl);
            if (!videoTracks.length) {
                throw new PlayerError('No video tracks found in manifest');
            }
            this.timelineModel = new TimelineModelClass(videoTracks);
            this.mediaSource = new MediaSource();
            this.segmentFetcher = new SegmentFetcher();
            if (!this.videoElement) throw new PlayerError('No video element attached');
            this.videoElement.src = URL.createObjectURL(this.mediaSource);
            this.mediaSourceHandler = new MediaSourceHandler(this.videoElement, this.mediaSource, this.segmentFetcher);
            this.mediaSourceHandler.registerEventBus(this.events);
            for (const track of videoTracks) {
                const generator = new SegmentURLGenerator(track);
                this.mediaSourceHandler.addVideoTrack(track.resolution!, {
                    type: 'video',
                    mimeType: `${track.mimeType}; codecs="${track.codecs}"`,
                    generator,
                    segmentIndex: 0
                });
            }
            if (audioTracks.length > 0) {
                const audioTrack = audioTracks[0];
                const generator = new SegmentURLGenerator(audioTrack);
                this.mediaSourceHandler.addAudioTrack({
                    type: 'audio',
                    mimeType: `${audioTrack.mimeType}; codecs="${audioTrack.codecs}"`,
                    generator,
                    segmentIndex: 0
                });
            }
            const initPromise = this.mediaSourceHandler.init();
            this.pendingOperations.add(initPromise);
            await initPromise;
            this.pendingOperations.delete(initPromise);
            this.onReady?.();
        } catch (err) {
            throw new PlayerError('Failed to load manifest', err);
        }
    }

    /**
     * Begins playback of the loaded media.
     */
    public play() {
        this.videoElement?.play().catch(err => {
            logger.error('[Player] Play error:', err);
            this.onError?.(err);
        });
    }
    /**
       * Pauses the current media playback.
       */
    public pause() {
        this.videoElement?.pause();
    }
    /**
     * Checks if the video is currently paused.
     * @returns True if paused, false otherwise.
     */
    public isPaused(): boolean {
        return this.videoElement?.paused ?? true;
    }
    /**
     * Gets the current playback time in seconds.
     * @returns The current time in seconds.
     */
    public getCurrentTime(): number {
        return this.videoElement?.currentTime ?? 0;
    }
    /**
     * Seeks to the specified time in seconds.
     * @param time - Time to seek to (in seconds).
     */
    public seekTo(time: number) {
        if (this.videoElement) {
            this.videoElement.currentTime = time;
        }
    }
    /**
     * Sets the playback volume.
     * @param volume - Volume level (0.0 to 1.0).
     */
    public setVolume(volume: number) {
        if (this.videoElement) {
            this.videoElement.volume = Math.max(0, Math.min(1, volume));
        }
    }
    /**
     * Mutes the audio.
     */
    public mute() {
        if (this.videoElement) {
            this.videoElement.muted = true;
        }
    }
    /**
     * Unmutes the audio.
     */
    public unmute() {
        if (this.videoElement) {
            this.videoElement.muted = false;
        }
    }
    /**
     * Stops playback and resets the video element and internal state.
     */
    public reset() {
        if (this.videoElement) {
            this.videoElement.pause();
            this.videoElement.removeAttribute('src');
            this.videoElement.load();
        }
        this.mediaSourceHandler = undefined as any;
        this.mediaSource = undefined;
        this.segmentFetcher = new SegmentFetcher();
        this.manifestUrl = undefined;
        logger.info('[Player] Reset complete');
    }
    /**
     * Returns the current bitrate (in bits per second) of the active video track.
     * Delegates to the underlying MediaSourceHandler.
     * @returns Bitrate in bits per second, or 0 if unavailable.
     */
    public getBitrate(): number {
        return this.mediaSourceHandler?.getCurrentBitrate() ?? 0;
    }
    /**
      * Gets the resolution of the currently playing video.
      * @returns A string in the format 'WIDTHxHEIGHT' (e.g. '1280x720').
      */
    public getResolution(): string {
        return this.mediaSourceHandler?.getCurrentResolution() ?? '0x0';
    }
    /**
       * Retrieves all available video renditions parsed from the DASH manifest.
       * @returns An array of objects containing resolution and bitrate for each available rendition.
       */
    public getAvailableRenditions(): { resolution: string; bitrate: number }[] {
        return this.mediaSourceHandler?.getAvailableRenditions() ?? [];
    }
    /**
      * Switches the active video track to a specific resolution, if available.
      * Useful for manual quality selection in a custom player UI.
      * @param resolution - The resolution string (e.g., '640x360', '1920x1080') to switch to.
      */
    public setRendition(resolution: string): void {
        this.mediaSourceHandler?.setRendition(resolution);
    }
    /**
      * Enables or disables adaptive bitrate (ABR) logic.
      * Currently a stub. Future implementations may automatically adjust quality based on bandwidth.
      * @param enable - Set to true to enable ABR, false to disable.
      */
    public setAdaptiveBitrate(enable: boolean): void {
        this.mediaSourceHandler?.setAdaptiveBitrate(enable);
    }
    /**
     * Destroys the player instance and detaches the video element.
     */
    public async destroy(): Promise<void> {
        if (this.isDestroyed) {
            return;
        }

        this.isDestroyed = true;

        try {
            // Wait for pending operations to complete
            await Promise.all(Array.from(this.pendingOperations));

            if (this.videoElement) {
                this.videoElement.pause();
                this.videoElement.src = '';
                this.videoElement.load();
            }

            this.mediaSourceHandler.destroy();
            this.segmentFetcher.destroy();
            this.eventBus.destroy();
            this.timelineModel = null;
            this.videoElement = null;

            logger.info('[Player] Destroyed');
        } catch (err) {
            logger.error('[Player] Error during destruction:', err);
        }
    }
    public getEventBus() {
        return this.eventBus;
    }
    private checkSegmentAtTime(currentTime: number) {
        if (!this.timelineModel) return;

        const segInfo = this.timelineModel.getSegmentForTime(currentTime);
        if (!segInfo) return;
        // Map SegmentTemplateInfo to TimelineSegment
        const segment: TimelineSegment = {
            start: currentTime,
            end: currentTime + (segInfo.duration / segInfo.timescale),
            url: segInfo.baseURL,
            type: 'content' // or 'ad' if you have a way to distinguish
        };
        if (this.currentSegment && this.currentSegment.url === segment.url) return;
        this.currentSegment = segment;
        if (segment.type === 'ad') {
            logger.info('[Player] ➤ Now playing ad segment:', segment.url);
            this.handleAdSegment(segment);
        } else {
            logger.info('[Player] 🎬 Now playing content segment:', segment.url);
        }
    }

    private async handleAdSegment(segment: TimelineSegment) {
        if (this.isDestroyed || !this.mediaSourceHandler) return;

        try {
            this.pause();
            const fetchPromise = fetch(segment.url);
            this.pendingOperations.add(fetchPromise);
            const response = await fetchPromise;
            this.pendingOperations.delete(fetchPromise);

            const bufferPromise = response.arrayBuffer();
            this.pendingOperations.add(bufferPromise);
            const buffer = await bufferPromise;
            this.pendingOperations.delete(bufferPromise);

            const appendPromise = this.mediaSourceHandler.appendAdBuffer(buffer);
            this.pendingOperations.add(appendPromise);
            await appendPromise;
            this.pendingOperations.delete(appendPromise);

            this.seekTo(segment.start);
            const adPromise = this.adManager.handleAdSegment(segment);
            this.pendingOperations.add(adPromise);
            await adPromise;
            this.pendingOperations.delete(adPromise);

            this.play();
        } catch (err) {
            logger.error('[Player] Ad segment failed:', err);
            this.onError?.(err);
        }
    }

    public skipAd(): boolean {
        return this.adManager.skipCurrentAd();
    }

    public isAdPlaying(): boolean {
        return this.adManager.isAdActive();
    }

    public getAdMetrics() {
        return this.adManager.getAdMetrics();
    }

    public updateAdConfig(config: Partial<AdConfig>) {
        this.adManager.updateConfig(config);
    }

    private handleError(error: unknown): void {
        this.lastError = error instanceof Error ? error : new Error(String(error));
        this.retryCount++;

        if (this.retryCount <= this.MAX_RETRY_ATTEMPTS) {
            logger.warn(`[Player] Retrying after error (attempt ${this.retryCount}/${this.MAX_RETRY_ATTEMPTS})`);
            setTimeout(() => this.startBuffering(), this.RETRY_DELAY);
        } else {
            logger.error('[Player] Max retry attempts reached');
            this.eventBus.emit(PlayerEventType.ERROR, this.lastError);
        }
    }

    private handleSegmentLoaded(segment: TimelineSegment): void {
        this.retryCount = 0;
        this.lastError = null;
        this.eventBus.emit(PlayerEventType.SEGMENT_LOADED, segment);
    }

    private handleSegmentError(error: unknown): void {
        this.handleError(error);
    }

    private async startBuffering(): Promise<void> {
        if (!this.videoElement || !this.timelineModel) {
            return;
        }
        try {
            const currentTime = this.videoElement.currentTime;
            const segmentInfo = (this.timelineModel as any).getSegmentForTime(currentTime) as SegmentTemplateInfo | null;
            if (!segmentInfo) {
                throw new PlayerError('No segment found for current time');
            }
            const segment: TimelineSegment = {
                start: currentTime,
                end: currentTime + (segmentInfo.duration / segmentInfo.timescale),
                url: segmentInfo.baseURL,
                type: 'content'
            };
            const buffer = await this.segmentFetcher.fetchSegment(segment.url);
            await this.mediaSourceHandler.appendAdBuffer(buffer.data);
            this.eventBus.emit(PlayerEventType.SEGMENT_LOADED, segment);
        } catch (err) {
            this.handleError(err);
        }
    }

    public getVideoElement(): HTMLVideoElement | null {
        return this.videoElement;
    }

    public getTimelineModel(): TimelineModelClass | null {
        return this.timelineModel;
    }

    public isInitialized(): boolean {
        return this.isPlayerInitialized;
    }

    public getLastError(): Error | null {
        return this.lastError;
    }

    /**
     * Sets the timeline for the player
     * @param timeline The timeline to set
     */
    public setTimeline(timeline: TimelineModelClass) {
        if (this.isDestroyed) {
            throw new PlayerError('Cannot set timeline on destroyed player');
        }

        if (!this.mediaSourceHandler) {
            throw new PlayerError('MediaSourceHandler not initialized');
        }

        this.mediaSourceHandler.setTimeline(timeline);
    }

    /**
     * Gets the current timeline
     * @returns The current timeline
     */
    public getTimeline(): TimelineModelClass | null {
        if (this.isDestroyed) {
            throw new PlayerError('Cannot get timeline from destroyed player');
        }

        return this.mediaSourceHandler?.getTimeline() || null;
    }
}