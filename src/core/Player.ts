import { MPDParser } from '../dash/MPDParser.js';
import { MediaSourceHandler } from './MediaSourceHandler.js';
import { logger } from '../utils/Logger.js';
import { HLSParser } from '../hls/HLSParser.js';
import { SegmentTemplateInfo } from './types.js';

type PlayerEventHook = () => void;
type ErrorHook = (err: unknown) => void;
type TimeUpdateHook = (time: number) => void;
// type StreamType = 'dash' | 'hls';

export class Player {
    private videoElement?: HTMLVideoElement;
    private mediaSourceHandler?: MediaSourceHandler;
    private manifestUrl?: string;

    public onPlay?: PlayerEventHook;
    public onPause?: PlayerEventHook;
    public onEnded?: PlayerEventHook;
    public onReady?: PlayerEventHook;
    public onError?: ErrorHook;
    public onTimeUpdate?: TimeUpdateHook;
    public onBuffering?: PlayerEventHook;

    constructor() {
        logger.setLevel('debug');
    }

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

    async load(manifestUrl: string) {
        if (!this.videoElement) {
            throw new Error('[Player] No video element attached. Use attachVideoElement().');
        }

        this.manifestUrl = manifestUrl;
        logger.info('[Player] Loading manifest:', manifestUrl);

        try {
            let segments: SegmentTemplateInfo[] = [];

            if (manifestUrl.endsWith('.mpd')) {
                // DASH
                const parser = new MPDParser();
                const videoTracks = await parser.parseVideo(manifestUrl);
                const audioTracks = await parser.parseAudio(manifestUrl);
                segments = [...videoTracks, ...audioTracks];
            } else if (manifestUrl.endsWith('.m3u8')) {
                // HLS
                const parser = new HLSParser();
                let mediaUrl = manifestUrl;

                if (await parser.isMaster(manifestUrl)) {
                    mediaUrl = await parser.parseMasterPlaylist(manifestUrl);
                }

                const track = await parser.parseMediaPlaylist(mediaUrl);

                segments = [{
                    baseURL: track.baseURL,
                    representationID: 'hls-track',
                    initialization: track.initSegment || '',
                    media: '',
                    startNumber: 0,
                    timescale: 1,
                    duration: 1,
                    useTimeTemplate: false,
                    mimeType: 'video/mp4', // For fMP4
                    codecs: 'avc1.42E01E, mp4a.40.2',
                    segments: track.segments
                }];
            } else {
                throw new Error('Unsupported manifest format');
            }

            this.mediaSourceHandler = new MediaSourceHandler(this.videoElement, segments);
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

    setVolume(volume: number) {
        if (this.videoElement) {
            this.videoElement.volume = Math.max(0, Math.min(1, volume));
        }
    }

    mute() {
        if (this.videoElement) {
            this.videoElement.muted = true;
        }
    }

    unmute() {
        if (this.videoElement) {
            this.videoElement.muted = false;
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