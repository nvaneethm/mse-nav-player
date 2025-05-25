/**
 * @fileoverview The Player class provides a simple interface to load,
 * control, and destroy DASH-based video playback using Media Source Extensions.
 * It supports event hooks, volume controls, and resolution switching.
 */

import { MPDParser } from '../dash/MPDParser.js';
import { MediaSourceHandler } from './MediaSourceHandler.js';
import { logger } from '../utils/Logger.js';
import { SegmentTemplateInfo } from '../dash/types.js';
import { SegmentFetcher } from '../dash/SegmentFetcher.js';
import { SegmentURLGenerator } from '../dash/SegmentURLGenerator.js';

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

/**
 * The Player class abstracts a complete video playback controller built over
 * Media Source Extensions (MSE) and custom DASH parsing logic.
 */
export class Player {
    private videoElement?: HTMLVideoElement;
    private mediaSourceHandler?: MediaSourceHandler;
    private manifestUrl?: string;
    private mediaSource?: MediaSource;
    private segmentFetcher?: SegmentFetcher;

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
    /**
     * Creates a new Player instance.
     * Sets the logging level and prepares event hooks.
     */
    constructor() {
        logger.setLevel('debug');
    }
    /**
      * Attaches the given HTML video element to the player.
      * Registers internal event listeners for playback hooks.
      * @param video - HTMLVideoElement to attach.
      */
    attachVideoElement(video: HTMLVideoElement) {
        this.videoElement = video;

        video.onplay = () => this.onPlay?.();
        video.onpause = () => this.onPause?.();
        video.onended = () => this.onEnded?.();
        video.onerror = () => this.onError?.(video.error);
        video.ontimeupdate = () => this.onTimeUpdate?.(video.currentTime);
        video.onwaiting = () => this.onBuffering?.();

        logger.info('[Player] Video element attached');
    }
    /**
       * Loads a DASH manifest and initializes playback.
       * @param manifestUrl - URL to the MPD manifest.
       */
    async load(manifestUrl: string) {
        if (!this.videoElement) {
            throw new Error('[Player] No video element attached. Use attachVideoElement().');
        }

        this.manifestUrl = manifestUrl;
        logger.info('[Player] Loading manifest:', manifestUrl);

        try {
            const parser = new MPDParser();
            const { videoTracks, audioTracks } = await parser.parse(manifestUrl);

            this.mediaSource = new MediaSource();
            this.segmentFetcher = new SegmentFetcher();

            this.videoElement.src = URL.createObjectURL(this.mediaSource);

            this.mediaSourceHandler = new MediaSourceHandler(this.videoElement, this.mediaSource, this.segmentFetcher);
            
            // Add video tracks to MediaSourceHandler
            for (const track of videoTracks) {
                const generator = new SegmentURLGenerator(track);
                this.mediaSourceHandler.addVideoTrack(track.resolution!, {
                    type: 'video',
                    mimeType: `${track.mimeType}; codecs="${track.codecs}"`,
                    generator,
                    segmentIndex: 0
                });
            }

            // Add audio track if available
            if (audioTracks.length > 0) {
                const audioTrack = audioTracks[0]; // Use first audio track
                const generator = new SegmentURLGenerator(audioTrack);
                this.mediaSourceHandler.addAudioTrack({
                    type: 'audio',
                    mimeType: `${audioTrack.mimeType}; codecs="${audioTrack.codecs}"`,
                    generator,
                    segmentIndex: 0
                });
            }

            await this.mediaSourceHandler.init();

            this.onReady?.();
        } catch (err) {
            logger.error('[Player] Error during load:', err);
            this.onError?.(err);
        }
    }
    /**
     * Begins playback of the loaded media.
     */
    play() {
        this.videoElement?.play().catch(err => {
            logger.error('[Player] Play error:', err);
            this.onError?.(err);
        });
    }
    /**
       * Pauses the current media playback.
       */
    pause() {
        this.videoElement?.pause();
    }
    /**
     * Checks if the video is currently paused.
     * @returns True if paused, false otherwise.
     */
    isPaused(): boolean {
        return this.videoElement?.paused ?? true;
    }
    /**
     * Gets the current playback time in seconds.
     * @returns The current time in seconds.
     */
    getCurrentTime(): number {
        return this.videoElement?.currentTime ?? 0;
    }
    /**
     * Seeks to the specified time in seconds.
     * @param time - Time to seek to (in seconds).
     */
    seekTo(time: number) {
        if (this.videoElement) {
            this.videoElement.currentTime = time;
        }
    }
    /**
     * Sets the playback volume.
     * @param volume - Volume level (0.0 to 1.0).
     */
    setVolume(volume: number) {
        if (this.videoElement) {
            this.videoElement.volume = Math.max(0, Math.min(1, volume));
        }
    }
    /**
     * Mutes the audio.
     */
    mute() {
        if (this.videoElement) {
            this.videoElement.muted = true;
        }
    }
    /**
     * Unmutes the audio.
     */
    unmute() {
        if (this.videoElement) {
            this.videoElement.muted = false;
        }
    }
    /**
     * Stops playback and resets the video element and internal state.
     */
    reset() {
        if (this.videoElement) {
            this.videoElement.pause();
            this.videoElement.removeAttribute('src');
            this.videoElement.load();
        }

        this.mediaSourceHandler = undefined;
        this.mediaSource = undefined;
        this.segmentFetcher = undefined;
        this.manifestUrl = undefined;

        logger.info('[Player] Reset complete');
    }
    /**
     * Returns the current bitrate (in bits per second) of the active video track.
     * Delegates to the underlying MediaSourceHandler.
     * @returns Bitrate in bits per second, or 0 if unavailable.
     */
    getBitrate(): number {
        return this.mediaSourceHandler?.getCurrentBitrate() ?? 0;
    }
    /**
      * Gets the resolution of the currently playing video.
      * @returns A string in the format 'WIDTHxHEIGHT' (e.g. '1280x720').
      */
    getResolution(): string {
        return this.mediaSourceHandler?.getCurrentResolution() ?? '0x0';
    }
    /**
       * Retrieves all available video renditions parsed from the DASH manifest.
       * @returns An array of objects containing resolution and bitrate for each available rendition.
       */
    getAvailableRenditions(): { resolution: string; bitrate: number }[] {
        return this.mediaSourceHandler?.getAvailableRenditions() ?? [];
    }
    /**
      * Switches the active video track to a specific resolution, if available.
      * Useful for manual quality selection in a custom player UI.
      * @param resolution - The resolution string (e.g., '640x360', '1920x1080') to switch to.
      */
    setRendition(resolution: string): void {
        this.mediaSourceHandler?.setRendition(resolution);
    }
    /**
      * Enables or disables adaptive bitrate (ABR) logic.
      * Currently a stub. Future implementations may automatically adjust quality based on bandwidth.
      * @param enable - Set to true to enable ABR, false to disable.
      */
    setAdaptiveBitrate(enable: boolean): void {
        this.mediaSourceHandler?.setAdaptiveBitrate(enable);
    }
    /**
     * Destroys the player instance and detaches the video element.
     */
    destroy() {
        this.reset();
        this.videoElement = undefined;
        logger.info('[Player] Destroyed player');
    }
}