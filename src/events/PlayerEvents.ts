import { TimelineSegment } from '../types/timeline.js';
import { EventBus } from './EventBus.js';
import { AdEventData, AdErrorEventData, AdEndEventData } from '../ads/types.js';

export enum PlayerEventType {
    PLAYBACK_STARTED = 'playback_started',
    PLAYBACK_PAUSED = 'playback_paused',
    PLAYBACK_ENDED = 'playback_ended',
    ERROR = 'error',
    SEGMENT_LOADED = 'segment_loaded',
    SEGMENT_ERROR = 'segment_error',
    BUFFERING = 'buffering',
    READY = 'ready'
}

export class PlayerEvents extends EventBus {
    constructor() {
        super();
    }

    // Ad-specific event types
    public onAdStart(callback: (data: AdEventData) => void): void {
        this.on('ad-start', callback);
    }

    public onAdEnd(callback: (data: AdEndEventData) => void): void {
        this.on('ad-end', callback);
    }

    public onAdError(callback: (data: AdErrorEventData) => void): void {
        this.on('ad-error', callback);
    }

    public onAdSkipped(callback: (data: AdEndEventData) => void): void {
        this.on('ad-skipped', callback);
    }

    // Player-specific event types
    public onPlay(callback: () => void): void {
        this.on(PlayerEventType.PLAYBACK_STARTED, callback);
    }

    public onPause(callback: () => void): void {
        this.on(PlayerEventType.PLAYBACK_PAUSED, callback);
    }

    public onEnded(callback: () => void): void {
        this.on(PlayerEventType.PLAYBACK_ENDED, callback);
    }

    public onReady(callback: () => void): void {
        this.on(PlayerEventType.READY, callback);
    }

    public onError(callback: (error: Error) => void): void {
        this.on(PlayerEventType.ERROR, callback);
    }

    public onTimeUpdate(callback: (time: number) => void): void {
        this.on('timeupdate', callback);
    }

    public onBuffering(callback: () => void): void {
        this.on(PlayerEventType.BUFFERING, callback);
    }

    public onSegmentLoaded(callback: (segment: any) => void): void {
        this.on(PlayerEventType.SEGMENT_LOADED, callback);
    }

    public onSegmentError(callback: (error: Error) => void): void {
        this.on(PlayerEventType.SEGMENT_ERROR, callback);
    }

    public emitPlay(): void {
        this.emit(PlayerEventType.PLAYBACK_STARTED);
    }

    public emitPause(): void {
        this.emit(PlayerEventType.PLAYBACK_PAUSED);
    }

    public emitEnded(): void {
        this.emit(PlayerEventType.PLAYBACK_ENDED);
    }

    public emitError(error: Error): void {
        this.emit(PlayerEventType.ERROR, error);
    }

    public emitSegmentLoaded(segment: any): void {
        this.emit(PlayerEventType.SEGMENT_LOADED, segment);
    }

    public emitSegmentError(error: Error): void {
        this.emit(PlayerEventType.SEGMENT_ERROR, error);
    }

    public emitBuffering(): void {
        this.emit(PlayerEventType.BUFFERING);
    }

    public emitReady(): void {
        this.emit(PlayerEventType.READY);
    }
} 