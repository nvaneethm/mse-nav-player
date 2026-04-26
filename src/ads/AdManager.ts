import { logger } from '../utils/Logger.js';
import { TimelineSegment } from '../types/timeline.js';
import { PlayerEvents } from '../events/PlayerEvents.js';
import { AdConfig, AdMetrics, AdEventData, AdErrorEventData, AdEndEventData } from './types.js';
import { AD_EVENTS, DEFAULT_AD_CONFIG, AD_LOG_MESSAGES } from './constants.js';

export { AdConfig } from './types.js';

/**
 * Manages ad playback and tracking within the video player.
 * Handles ad segments, metrics collection, and event emission for ad-related events.
 */
export class AdManager {
    private currentAd?: TimelineSegment;
    private adMetrics: Map<string, AdMetrics> = new Map();
    private isAdPlaying: boolean = false;
    private events: PlayerEvents;
    private config: AdConfig;
    private adTimeout?: ReturnType<typeof setTimeout>;
    private isDestroyed: boolean = false;

    /**
     * Creates a new AdManager instance.
     * @param events - The PlayerEvents instance for emitting ad-related events
     * @param config - Optional configuration for ad behavior
     */
    constructor(events: PlayerEvents, config: Partial<AdConfig> = {}) {
        this.events = events;
        this.config = {
            preloadAds: config.preloadAds ?? DEFAULT_AD_CONFIG.PRELOAD_ADS,
            skipThreshold: config.skipThreshold ?? DEFAULT_AD_CONFIG.SKIP_THRESHOLD,
            maxAdDuration: config.maxAdDuration ?? DEFAULT_AD_CONFIG.MAX_AD_DURATION,
            allowMultipleAds: config.allowMultipleAds ?? DEFAULT_AD_CONFIG.ALLOW_MULTIPLE_ADS
        };
    }

    /**
     * Handles the playback of an ad segment.
     * @param segment - The timeline segment containing ad data
     * @throws Will throw an error if ad playback fails
     */
    public async handleAdSegment(segment: TimelineSegment): Promise<void> {
        if (this.isDestroyed) {
            logger.warn(AD_LOG_MESSAGES.MANAGER_DESTROYED);
            return;
        }

        if (!segment || typeof segment.start !== 'number' || typeof segment.end !== 'number') {
            logger.error(AD_LOG_MESSAGES.INVALID_SEGMENT);
            return;
        }

        if (!this.config.allowMultipleAds && this.isAdPlaying) {
            logger.warn(AD_LOG_MESSAGES.SKIP_MULTIPLE);
            return;
        }

        if (segment.end - segment.start > this.config.maxAdDuration) {
            logger.warn(AD_LOG_MESSAGES.DURATION_EXCEEDED);
            return;
        }

        // Clear any existing ad timeout
        if (this.adTimeout) {
            clearTimeout(this.adTimeout);
            this.adTimeout = undefined;
        }

        this.currentAd = segment;
        this.isAdPlaying = true;

        const adId = `ad_${Date.now()}`;
        this.adMetrics.set(adId, {
            startTime: Date.now(),
            endTime: 0,
            duration: segment.end - segment.start,
            completed: false,
            skipped: false
        });

        try {
            this.events.emit(AD_EVENTS.START, { adId, segment } as AdEventData);
            
            // Simulate ad playback with timeout
            await new Promise<void>((resolve, reject) => {
                this.adTimeout = setTimeout(() => {
                    if (!this.isDestroyed) {
                        this.completeAd(adId);
                        resolve();
                    }
                }, (segment.end - segment.start) * 1000);
            });

        } catch (error) {
            this.handleAdError(adId, error);
        }
    }

    /**
     * Marks an ad as complete and emits the ad-end event.
     * @param adId - The unique identifier of the ad
     */
    private completeAd(adId: string): void {
        if (this.isDestroyed) return;

        const metrics = this.adMetrics.get(adId);
        if (metrics) {
            metrics.endTime = Date.now();
            metrics.completed = true;
            this.adMetrics.set(adId, metrics);
        }

        this.isAdPlaying = false;
        this.currentAd = undefined;
        this.events.emit(AD_EVENTS.END, { adId } as AdEndEventData);
    }

    /**
     * Handles ad playback errors and emits the ad-error event.
     * @param adId - The unique identifier of the ad
     * @param error - The error that occurred during ad playback
     */
    private handleAdError(adId: string, error: unknown): void {
        if (this.isDestroyed) return;

        const metrics = this.adMetrics.get(adId);
        if (metrics) {
            metrics.error = error instanceof Error ? error.message : String(error);
            this.adMetrics.set(adId, metrics);
        }

        this.isAdPlaying = false;
        this.currentAd = undefined;
        this.events.emit(AD_EVENTS.ERROR, { adId, error } as AdErrorEventData);
    }

    /**
     * Attempts to skip the currently playing ad.
     * @returns true if the ad was successfully skipped, false otherwise
     */
    public skipCurrentAd(): boolean {
        if (this.isDestroyed || !this.isAdPlaying || !this.currentAd) {
            return false;
        }

        // Clear the ad timeout
        if (this.adTimeout) {
            clearTimeout(this.adTimeout);
            this.adTimeout = undefined;
        }

        const adId = Array.from(this.adMetrics.keys()).pop();
        if (adId) {
            const metrics = this.adMetrics.get(adId);
            if (metrics) {
                metrics.skipped = true;
                this.adMetrics.set(adId, metrics);
            }
        }

        this.isAdPlaying = false;
        this.currentAd = undefined;
        this.events.emit(AD_EVENTS.SKIPPED, { adId } as AdEndEventData);
        return true;
    }

    /**
     * Checks if an ad is currently playing.
     * @returns true if an ad is playing, false otherwise
     */
    public isAdActive(): boolean {
        return this.isAdPlaying && !this.isDestroyed;
    }

    /**
     * Gets the currently playing ad segment.
     * @returns The current ad segment or undefined if no ad is playing
     */
    public getCurrentAd(): TimelineSegment | undefined {
        return this.isDestroyed ? undefined : this.currentAd;
    }

    /**
     * Gets the metrics for all ads that have been played.
     * @returns A Map of ad IDs to their respective metrics
     */
    public getAdMetrics(): Map<string, AdMetrics> {
        return new Map(this.adMetrics);
    }

    /**
     * Updates the ad configuration with new settings.
     * @param newConfig - Partial configuration object containing new settings
     */
    public updateConfig(newConfig: Partial<AdConfig>): void {
        if (this.isDestroyed) return;
        this.config = { ...this.config, ...newConfig };
    }

    /**
     * Cleans up resources and prevents further ad operations.
     */
    public destroy(): void {
        this.isDestroyed = true;
        if (this.adTimeout) {
            clearTimeout(this.adTimeout);
            this.adTimeout = undefined;
        }
        this.isAdPlaying = false;
        this.currentAd = undefined;
        this.adMetrics.clear();
    }
} 