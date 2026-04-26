import { SegmentTemplateInfo } from '../types';
import { logger } from '../../utils/Logger';

export class SegmentURLGeneratorError extends Error {
    constructor(
        message: string,
        public readonly template: string,
        public readonly cause?: unknown
    ) {
        super(message);
        this.name = 'SegmentURLGeneratorError';
    }
}

export class SegmentURLGenerator {
    public readonly segmentDurationSeconds: number;
    private readonly baseURL: string;
    private readonly representationID: string;
    private readonly bandwidth: string;
    private readonly initTemplate: string;
    private readonly mediaTemplate: string;
    private readonly useTimeTemplate: boolean;
    private readonly info: SegmentTemplateInfo;
    private readonly MAX_SEGMENT_INDEX = 1000000;
    private readonly MAX_TIME_VALUE = 1000000000;

    constructor(private SegmentInfo: SegmentTemplateInfo) {
        this.info = SegmentInfo;
        this.segmentDurationSeconds = SegmentInfo.duration / SegmentInfo.timescale;
        this.baseURL = SegmentInfo.baseURL || '';
        this.representationID = SegmentInfo.representationID;
        this.bandwidth = String(SegmentInfo.bandwidth ?? 0);
        this.initTemplate = SegmentInfo.initialization;
        this.mediaTemplate = SegmentInfo.media;
        this.useTimeTemplate = SegmentInfo.useTimeTemplate ?? SegmentInfo.media.includes('$Time$');

        this.validateTemplates();
    }

    private validateTemplates(): void {
        // SegmentList and SegmentBase modes have no media template — skip template validation
        if (this.info.segmentListURLs || this.info.media === '') return;

        if (!this.mediaTemplate) {
            throw new SegmentURLGeneratorError('Missing media template', 'media');
        }

        const hasNumberVar = this.mediaTemplate.includes('$Number$');
        const hasTimeVar = this.mediaTemplate.includes('$Time$');
        const hasBandwidthVar = this.mediaTemplate.includes('$Bandwidth$');
        const hasRepresentationVar = this.mediaTemplate.includes('$RepresentationID$');

        if (!hasNumberVar && !hasTimeVar && !hasBandwidthVar && !hasRepresentationVar) {
            throw new SegmentURLGeneratorError(
                'Media template must contain $Number$, $Time$, $Bandwidth$, or $RepresentationID$',
                this.mediaTemplate
            );
        }

        if (this.useTimeTemplate && !hasTimeVar) {
            throw new SegmentURLGeneratorError(
                'Time template enabled but $Time$ not found in media template',
                this.mediaTemplate
            );
        }
    }

    private applyTemplateVars(template: string, number?: number, time?: number): string {
        return template
            .replace(/\$RepresentationID\$/g, this.representationID)
            .replace(/\$Bandwidth\$/g, this.bandwidth)
            .replace(/\$Number%\d+d\$/g, (m) => {
                // Handle $Number%06d$ style padding
                const pad = parseInt(m.match(/\d+/)?.[0] ?? '0');
                return String(number ?? 0).padStart(pad, '0');
            })
            .replace(/\$Number\$/g, String(number ?? 0))
            .replace(/\$Time\$/g, String(time ?? 0));
    }

    getInitializationURL(): string {
        // SegmentList: initialization is already a fully resolved URL
        if (this.info.segmentListURLs) {
            return this.info.initialization;
        }
        // SegmentBase: init is fetched via byte-range against baseURL; return the file URL
        if (this.info.media === '') {
            return this.baseURL;
        }
        if (!this.initTemplate) {
            throw new SegmentURLGeneratorError('Missing initialization template', 'initialization');
        }
        try {
            const resolved = this.applyTemplateVars(this.initTemplate);
            const url = new URL(resolved, this.baseURL);
            logger.debug(`[SegmentURLGenerator] Init URL: ${url.href}`);
            return url.href;
        } catch (err) {
            throw new SegmentURLGeneratorError('Failed to generate initialization URL', this.initTemplate, err);
        }
    }

    /** For SegmentBase tracks: byte range string for the media segment at index, or undefined. */
    getMediaSegmentByteRange(index: number): string | undefined {
        if (this.info.segmentBaseByteRanges) {
            return this.info.segmentBaseByteRanges[index];
        }
        return undefined;
    }

    getInfo(): SegmentTemplateInfo {
        return this.info;
    }

    getMediaSegmentURL(index: number): string {
        if (index < 0 || index > this.MAX_SEGMENT_INDEX) {
            throw new SegmentURLGeneratorError(`Invalid segment index: ${index}`, this.mediaTemplate);
        }

        // SegmentBase: all segments come from the same file; byte range is set separately
        if (this.info.media === '') {
            return this.baseURL;
        }

        // SegmentList: direct index lookup into pre-resolved URL list
        if (this.info.segmentListURLs) {
            const url = this.info.segmentListURLs[index];
            if (!url) {
                throw new SegmentURLGeneratorError(
                    `SegmentList index ${index} out of range (${this.info.segmentListURLs.length} segments)`,
                    'segmentList'
                );
            }
            return url;
        }

        try {
            let resolved: string;
            if (this.useTimeTemplate && this.info.timeline) {
                if (index >= this.info.timeline.length) {
                    throw new SegmentURLGeneratorError(
                        `Segment index ${index} exceeds timeline length ${this.info.timeline.length}`,
                        this.mediaTemplate
                    );
                }
                const time = this.info.timeline[index];
                if (time > this.MAX_TIME_VALUE) {
                    throw new SegmentURLGeneratorError(
                        `Time value ${time} exceeds maximum allowed value`,
                        this.mediaTemplate
                    );
                }
                resolved = this.applyTemplateVars(this.mediaTemplate, undefined, time);
            } else {
                const number = this.info.startNumber + index;
                resolved = this.applyTemplateVars(this.mediaTemplate, number);
            }

            const url = new URL(resolved, this.baseURL);
            logger.debug(`[SegmentURLGenerator] Media segment URL: ${url.href}`);
            return url.href;
        } catch (err) {
            throw new SegmentURLGeneratorError(
                `Failed to generate media segment URL for index ${index}`,
                this.mediaTemplate,
                err
            );
        }
    }

    getLastSegmentIndex(): number {
        // SegmentList: exact count
        if (this.info.segmentListURLs) {
            return this.info.segmentListURLs.length - 1;
        }
        // SegmentBase: count derived from parsed byte ranges
        if (this.info.segmentBaseByteRanges) {
            return this.info.segmentBaseByteRanges.length - 1;
        }
        if (this.info.timeline) {
            return this.info.timeline.length - 1;
        }
        const totalDuration = this.info.totalDuration ?? 0;
        const segmentDuration = this.info.duration / this.info.timescale;
        const approxTotal = Math.floor(totalDuration / segmentDuration);
        return this.info.startNumber + approxTotal - 1;
    }
}
