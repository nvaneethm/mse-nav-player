import { SegmentTemplateInfo } from '../dash/types';
import { logger } from '../utils/Logger';

export class TimelineModelError extends Error {
    constructor(
        message: string,
        public readonly cause?: unknown
    ) {
        super(message);
        this.name = 'TimelineModelError';
    }
}

export class TimelineModel {
    private readonly segments: SegmentTemplateInfo[];
    private readonly MAX_SEGMENTS = 10000; // Prevent memory issues
    private readonly MAX_SEGMENT_DURATION = 3600; // 1 hour in seconds
    private readonly MIN_SEGMENT_DURATION = 0.1; // 100ms in seconds
    private isDestroyed: boolean = false;

    constructor(segments: SegmentTemplateInfo[]) {
        if (!Array.isArray(segments)) {
            throw new TimelineModelError('Segments must be an array');
        }

        if (segments.length === 0) {
            throw new TimelineModelError('No segments provided');
        }

        if (segments.length > this.MAX_SEGMENTS) {
            throw new TimelineModelError(`Too many segments: ${segments.length} (max: ${this.MAX_SEGMENTS})`);
        }

        // Validate segment durations
        for (const segment of segments) {
            const duration = segment.duration / segment.timescale;
            if (duration < this.MIN_SEGMENT_DURATION) {
                throw new TimelineModelError(`Segment duration too short: ${duration}s (min: ${this.MIN_SEGMENT_DURATION}s)`);
            }
            if (duration > this.MAX_SEGMENT_DURATION) {
                throw new TimelineModelError(`Segment duration too long: ${duration}s (max: ${this.MAX_SEGMENT_DURATION}s)`);
            }
        }

        this.segments = segments;
        logger.debug('[TimelineModel] Initialized with', this.segments.length, 'segments');
    }

    public destroy(): void {
        this.isDestroyed = true;
        this.segments.length = 0; // Clear array
    }

    public getSegmentForTime(time: number): SegmentTemplateInfo | null {
        if (this.isDestroyed) {
            throw new TimelineModelError('TimelineModel is destroyed');
        }

        if (time < 0) {
            throw new TimelineModelError(`Invalid time: ${time} (must be >= 0)`);
        }

        try {
            let currentTime = 0;
            for (const segment of this.segments) {
                const segmentDuration = segment.duration / segment.timescale;
                if (time >= currentTime && time < currentTime + segmentDuration) {
                    return segment;
                }
                currentTime += segmentDuration;
            }

            // If time is beyond the last segment, return the last segment
            if (time >= currentTime && this.segments.length > 0) {
                return this.segments[this.segments.length - 1];
            }

            return null;
        } catch (err) {
            throw new TimelineModelError('Failed to get segment for time', err);
        }
    }

    public getTotalDuration(): number {
        if (this.isDestroyed) {
            throw new TimelineModelError('TimelineModel is destroyed');
        }

        try {
            return this.segments.reduce((total, segment) => {
                return total + (segment.duration / segment.timescale);
            }, 0);
        } catch (err) {
            throw new TimelineModelError('Failed to calculate total duration', err);
        }
    }

    public getSegmentCount(): number {
        if (this.isDestroyed) {
            throw new TimelineModelError('TimelineModel is destroyed');
        }
        return this.segments.length;
    }

    public getSegmentAtIndex(index: number): SegmentTemplateInfo | null {
        if (this.isDestroyed) {
            throw new TimelineModelError('TimelineModel is destroyed');
        }

        if (index < 0 || index >= this.segments.length) {
            throw new TimelineModelError(`Invalid segment index: ${index} (valid range: 0-${this.segments.length - 1})`);
        }

        return this.segments[index];
    }

    public getTimeForSegmentIndex(index: number): number {
        if (this.isDestroyed) {
            throw new TimelineModelError('TimelineModel is destroyed');
        }

        if (index < 0 || index >= this.segments.length) {
            throw new TimelineModelError(`Invalid segment index: ${index} (valid range: 0-${this.segments.length - 1})`);
        }

        try {
            return this.segments.slice(0, index).reduce((total, segment) => {
                return total + (segment.duration / segment.timescale);
            }, 0);
        } catch (err) {
            throw new TimelineModelError('Failed to calculate time for segment index', err);
        }
    }
}