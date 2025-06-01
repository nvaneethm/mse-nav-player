import { SegmentTemplateInfo } from './types';
import { logger } from '../utils/Logger';

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
    private readonly initTemplate: string;
    private readonly mediaTemplate: string;
    private readonly useTimeTemplate: boolean;
    private readonly info: SegmentTemplateInfo;
    private readonly MAX_SEGMENT_INDEX = 1000000; // Prevent infinite loops
    private readonly MAX_TIME_VALUE = 1000000000; // Prevent unreasonable time values

    constructor(private SegmentInfo: SegmentTemplateInfo) {
        this.info = SegmentInfo;
        this.segmentDurationSeconds = SegmentInfo.duration / SegmentInfo.timescale;
        this.baseURL = SegmentInfo.baseURL || '';
        this.representationID = SegmentInfo.representationID;
        this.initTemplate = SegmentInfo.initialization;
        this.mediaTemplate = SegmentInfo.media;
        this.useTimeTemplate = SegmentInfo.useTimeTemplate ?? SegmentInfo.media.indexOf('$Time$') !== -1;

        this.validateTemplates();
    }

    private validateTemplates(): void {
        if (!this.initTemplate) {
            throw new SegmentURLGeneratorError(
                'Missing initialization template',
                'initialization'
            );
        }

        if (!this.mediaTemplate) {
            throw new SegmentURLGeneratorError(
                'Missing media template',
                'media'
            );
        }

        if (!this.representationID) {
            throw new SegmentURLGeneratorError(
                'Missing representation ID',
                'representation'
            );
        }

        // Validate template variables
        const requiredVars = ['$RepresentationID$'];
        for (const template of [this.initTemplate, this.mediaTemplate]) {
            for (const requiredVar of requiredVars) {
                if (!template.includes(requiredVar)) {
                    throw new SegmentURLGeneratorError(
                        `Missing required variable ${requiredVar} in template`,
                        template
                    );
                }
            }
        }

        // Validate time template
        if (this.useTimeTemplate && !this.mediaTemplate.includes('$Time$')) {
            throw new SegmentURLGeneratorError(
                'Time template enabled but $Time$ not found in media template',
                this.mediaTemplate
            );
        }

        // Validate number template
        if (!this.useTimeTemplate && !this.mediaTemplate.includes('$Number$')) {
            throw new SegmentURLGeneratorError(
                'Number template required but $Number$ not found in media template',
                this.mediaTemplate
            );
        }
    }

    getInitializationURL(): string {
        try {
            // The manifest uses $RepresentationID$/$RepresentationID$_0.m4v format
            const resolved = `${this.representationID}/${this.representationID}_0.${this.representationID.includes('a64k') ? 'm4a' : 'm4v'}`;
            
            // Ensure URL safety and handle base URL correctly
            const url = new URL(resolved, this.baseURL);
            logger.debug(`[SegmentURLGenerator] Initialization URL: ${url.href} (base: ${this.baseURL}, template: ${this.initTemplate}, representationID: ${this.representationID})`);
            return url.href;
        } catch (err) {
            throw new SegmentURLGeneratorError(
                'Failed to generate initialization URL',
                this.initTemplate,
                err
            );
        }
    }

    getInfo(): SegmentTemplateInfo {
        return this.info;
    }

    getMediaSegmentURL(index: number): string {
        if (index < 0 || index > this.MAX_SEGMENT_INDEX) {
            throw new SegmentURLGeneratorError(
                `Invalid segment index: ${index}`,
                this.mediaTemplate
            );
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
                resolved = this.mediaTemplate.replace(/\$RepresentationID\$/g, this.representationID)
                    .replace('$Time$', time.toString());
            } else {
                const number = this.info.startNumber + index;
                // The manifest uses $RepresentationID$/$RepresentationID$_$Number$.m4v format
                resolved = `${this.representationID}/${this.representationID}_${number}.${this.representationID.includes('a64k') ? 'm4a' : 'm4v'}`;
            }

            // Ensure URL safety and handle base URL correctly
            const url = new URL(resolved, this.baseURL);
            logger.debug(`[SegmentURLGenerator] Media segment URL: ${url.href} (base: ${this.baseURL}, template: ${this.mediaTemplate}, representationID: ${this.representationID})`);
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
        if (this.info.timeline) {
            return this.info.timeline.length - 1;
        }
        // Use totalDuration from info if available for accurate segment count
        const totalDuration = this.info.totalDuration ?? 0;
        const segmentDuration = this.info.duration / this.info.timescale;
        const approxTotal = Math.floor(totalDuration / segmentDuration);
        return this.info.startNumber + approxTotal - 1;
    }

    private resolveTemplate(template: string, number?: number, time?: number): string {
        try {
            let resolved = template.replace('$RepresentationID$', this.representationID);
            
            if (number !== undefined) {
                if (number < 0 || number > this.MAX_SEGMENT_INDEX) {
                    throw new Error(`Invalid number value: ${number}`);
                }
                resolved = resolved.replace('$Number$', number.toString());
            }
            
            if (time !== undefined) {
                if (time < 0 || time > this.MAX_TIME_VALUE) {
                    throw new Error(`Invalid time value: ${time}`);
                }
                resolved = resolved.replace('$Time$', time.toString());
            }

            // Ensure URL safety and handle base URL correctly
            const url = new URL(resolved, this.baseURL);
            logger.debug(`[SegmentURLGenerator] Resolved URL: ${url.href} (base: ${this.baseURL}, template: ${template})`);
            return url.href;
        } catch (err) {
            throw new SegmentURLGeneratorError(
                'Failed to resolve template',
                template,
                err
            );
        }
    }
}