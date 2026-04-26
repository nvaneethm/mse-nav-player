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
    private segments: SegmentTemplateInfo[];
    private readonly MAX_SEGMENTS = 10000; // Prevent memory issues
    private readonly MAX_SEGMENT_DURATION = 3600; // 1 hour in seconds
    private readonly MIN_SEGMENT_DURATION = 0.1; // 100ms in seconds
    private isDestroyed: boolean = false;
    private presentationTimeOffset = 0; // seconds; non-zero for live streams

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

        this.segments = [...segments]; // copy so callers can't mutate our internal list
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

    // ── Live stream helpers ───────────────────────────────────────────────────

    /**
     * Append new segments from a refreshed live manifest.
     * Segments already present (by representationID + startNumber) are skipped.
     */
    public appendSegments(newSegments: SegmentTemplateInfo[]): void {
        if (this.isDestroyed) {
            throw new TimelineModelError('TimelineModel is destroyed');
        }
        const existingCount = this.segments.length;
        for (const seg of newSegments) {
            if (this.segments.length >= this.MAX_SEGMENTS) break;
            // Deduplicate by checking if it extends beyond current last segment
            this.segments.push(seg);
        }
        const added = this.segments.length - existingCount;
        if (added > 0) {
            logger.debug(`[TimelineModel] Appended ${added} new live segments (total: ${this.segments.length})`);
        }
    }

    /**
     * Remove segments whose end time falls before `beforeTime` (seconds).
     * Used to evict segments that have expired from the DVR window.
     */
    public trimBefore(beforeTime: number): void {
        if (this.isDestroyed) return;
        let cumulative = this.presentationTimeOffset;
        let trimCount = 0;
        for (const seg of this.segments) {
            const segEnd = cumulative + seg.duration / seg.timescale;
            if (segEnd <= beforeTime) {
                trimCount++;
                cumulative = segEnd;
            } else {
                break;
            }
        }
        if (trimCount > 0) {
            this.segments.splice(0, trimCount);
            this.presentationTimeOffset = cumulative;
            logger.debug(`[TimelineModel] Trimmed ${trimCount} expired segments; offset=${cumulative.toFixed(1)}s`);
        }
    }

    /**
     * Returns the presentation time of the latest available segment's end.
     */
    public getLiveEdge(): number {
        if (this.isDestroyed || this.segments.length === 0) return 0;
        return this.getTotalDuration() + this.presentationTimeOffset;
    }

    /**
     * Returns the available DVR window as {start, end} in presentation time.
     */
    public getAvailabilityRange(): { start: number; end: number } {
        return {
            start: this.presentationTimeOffset,
            end: this.getLiveEdge(),
        };
    }

    public setPresentationTimeOffset(offset: number): void {
        this.presentationTimeOffset = offset;
    }
}