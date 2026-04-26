import { TimelineSegment } from "../types/timeline";

export interface AdConfig {
    preloadAds: boolean;
    skipThreshold: number;
    maxAdDuration: number;
    allowMultipleAds: boolean;
}

export interface AdMetrics {
    startTime: number;
    endTime: number;
    duration: number;
    completed: boolean;
    skipped: boolean;
    error?: string;
}

export interface AdEventData {
    adId: string;
    segment: TimelineSegment;
}

export interface AdErrorEventData {
    adId: string;
    error: unknown;
}

export interface AdEndEventData {
    adId: string;
} 