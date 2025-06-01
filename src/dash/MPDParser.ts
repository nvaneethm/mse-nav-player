import { logger } from "../utils/Logger";
import { SegmentTemplateInfo } from "./types";

export class MPDParseError extends Error {
    constructor(
        message: string,
        public readonly url: string,
        public readonly cause?: unknown
    ) {
        super(message);
        this.name = 'MPDParseError';
    }
}

export class MPDParser {
    private readonly REQUEST_TIMEOUT = 10000; // 10 seconds
    private readonly MAX_MANIFEST_SIZE = 1024 * 1024; // 1MB

    async parse(url: string): Promise<{
        videoTracks: SegmentTemplateInfo[];
        audioTracks: SegmentTemplateInfo[];
    }> {
        return this.parseAdaptationSets(url);
    }

    async parseVideo(url: string): Promise<SegmentTemplateInfo[]> {
        const { videoTracks } = await this.parse(url);
        return videoTracks;
    }

    async parseAudio(url: string): Promise<SegmentTemplateInfo[]> {
        const { audioTracks } = await this.parse(url);
        return audioTracks;
    }

    private async parseAdaptationSets(url: string): Promise<{
        videoTracks: SegmentTemplateInfo[];
        audioTracks: SegmentTemplateInfo[];
    }> {
        logger.info('[MPDParser] Fetching manifest:', url);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.REQUEST_TIMEOUT);

        try {
            const response = await fetch(url, { signal: controller.signal });
            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new MPDParseError(
                    `Failed to fetch MPD: ${response.status}`,
                    url
                );
            }

            // Check content length
            const contentLength = response.headers.get('content-length');
            if (contentLength && parseInt(contentLength) > this.MAX_MANIFEST_SIZE) {
                throw new MPDParseError(
                    `Manifest size exceeds maximum allowed size of ${this.MAX_MANIFEST_SIZE} bytes`,
                    url
                );
            }

            const xmlText = await response.text();
            const xml = new DOMParser().parseFromString(xmlText, 'application/xml');

            // Validate XML parsing
            const parserError = xml.querySelector('parsererror');
            if (parserError) {
                throw new MPDParseError(
                    'Failed to parse MPD XML',
                    url,
                    parserError.textContent
                );
            }

            // Validate MPD root element
            const mpd = xml.querySelector('MPD');
            if (!mpd) {
                throw new MPDParseError('Missing MPD root element', url);
            }

            // Parse mediaPresentationDuration (e.g., PT634.566S)
            let totalDuration = 0;
            const durationStr = mpd.getAttribute('mediaPresentationDuration');
            if (durationStr) {
                const match = durationStr.match(/PT([0-9.]+)S/);
                if (match) {
                    totalDuration = parseFloat(match[1]);
                }
            }

            // Get the base URL from the MPD or use the manifest URL as base
            const mpdBaseURL = mpd.querySelector('BaseURL')?.textContent?.trim() || '.';
            const mpdBase = new URL(mpdBaseURL, url).href;
            const adaptationSets = Array.from(xml.querySelectorAll('AdaptationSet'));

            if (adaptationSets.length === 0) {
                throw new MPDParseError('No AdaptationSet elements found', url);
            }

            const videoTracks: SegmentTemplateInfo[] = [];
            const audioTracks: SegmentTemplateInfo[] = [];

            for (const set of adaptationSets) {
                const representations = Array.from(set.querySelectorAll('Representation'));
                if (representations.length === 0) {
                    logger.warn('[MPDParser] AdaptationSet has no representations');
                    continue;
                }

                for (const representation of representations) {
                    try {
                        const mimeType = this.getMimeType(representation, set);
                        const codecs = this.getCodecs(representation, set, mimeType);
                        const segmentTemplate = this.getSegmentTemplate(representation, set);
                        
                        if (!representation || !segmentTemplate) {
                            logger.warn('[MPDParser] Missing required elements in representation');
                            continue;
                        }

                        // Use the adaptation set's BaseURL if present, otherwise use the MPD's BaseURL
                        const adaptationBaseURL = set.querySelector('BaseURL')?.textContent?.trim() || mpdBaseURL;
                        const baseURL = new URL(adaptationBaseURL, mpdBase).href;

                        const width = representation.getAttribute('width');
                        const height = representation.getAttribute('height');

                        const timeline = this.parseSegmentTimeline(segmentTemplate);
                        const info = this.createSegmentTemplateInfo(
                            baseURL,
                            representation,
                            segmentTemplate,
                            mimeType,
                            codecs,
                            width,
                            height,
                            timeline,
                            totalDuration
                        );

                        if (mimeType.includes('audio')) {
                            audioTracks.push(info);
                        } else if (mimeType.includes('video')) {
                            videoTracks.push(info);
                        }
                    } catch (err) {
                        logger.error('[MPDParser] Error parsing representation:', err);
                        // Continue with next representation
                    }
                }
            }

            if (videoTracks.length === 0) {
                throw new MPDParseError('No valid video tracks found', url);
            }

            logger.debug('[MPDParser] Parsed videoTracks:', videoTracks);
            logger.debug('[MPDParser] Parsed audioTracks:', audioTracks);

            return { videoTracks, audioTracks };
        } catch (err) {
            if (err instanceof Error && err.name === 'AbortError') {
                throw new MPDParseError('Manifest fetch timeout', url);
            }
            if (err instanceof MPDParseError) {
                throw err;
            }
            throw new MPDParseError('Failed to parse MPD', url, err);
        }
    }

    private getMimeType(representation: Element, set: Element): string {
        return representation?.getAttribute('mimeType') ||
            set.getAttribute('mimeType') ||
            set.querySelector('ContentComponent')?.getAttribute('contentType') ||
            '';
    }

    private getCodecs(representation: Element, set: Element, mimeType: string): string {
        return representation?.getAttribute('codecs') ||
            set.getAttribute('codecs') ||
            (mimeType.includes('video') ? 'avc1.42E01E' :
                mimeType.includes('audio') ? 'mp4a.40.2' : '');
    }

    private getSegmentTemplate(representation: Element, set: Element): Element | null {
        return representation?.querySelector('SegmentTemplate') ||
            set.querySelector('SegmentTemplate');
    }

    private parseSegmentTimeline(segmentTemplate: Element): number[] | undefined {
        const timeline: number[] = [];
        const timelineNode = segmentTemplate.querySelector('SegmentTimeline');
        if (timelineNode) {
            let currentTime = 0;
            for (const s of Array.from(timelineNode.querySelectorAll('S'))) {
                const t = parseInt(s.getAttribute('t') || '') || currentTime;
                const d = parseInt(s.getAttribute('d') || '');
                const r = parseInt(s.getAttribute('r') || '0');
                for (let i = 0; i <= (r || 0); i++) {
                    timeline.push(t + i * d);
                }
                currentTime = t + ((r || 0) + 1) * d;
            }
        }
        return timeline.length > 0 ? timeline : undefined;
    }

    private createSegmentTemplateInfo(
        baseURL: string,
        representation: Element,
        segmentTemplate: Element,
        mimeType: string,
        codecs: string,
        width: string | null,
        height: string | null,
        timeline: number[] | undefined,
        totalDuration: number
    ): SegmentTemplateInfo {
        const representationID = representation.getAttribute('id');
        const initialization = segmentTemplate.getAttribute('initialization') || '';
        const media = segmentTemplate.getAttribute('media') || '';

        // Validate required attributes
        if (!representationID) {
            throw new MPDParseError('Missing representation ID', baseURL);
        }
        if (!initialization) {
            throw new MPDParseError('Missing initialization template', baseURL);
        }
        if (!media) {
            throw new MPDParseError('Missing media template', baseURL);
        }

        logger.debug('[MPDParser] Creating segment template info:', {
            baseURL,
            representationID,
            initialization,
            media,
            mimeType,
            codecs
        });

        return {
            baseURL,
            representationID,
            initialization,
            media,
            startNumber: parseInt(segmentTemplate.getAttribute('startNumber') || '1'),
            timescale: parseInt(segmentTemplate.getAttribute('timescale') || '1'),
            duration: parseInt(segmentTemplate.getAttribute('duration') || '1'),
            useTimeTemplate: segmentTemplate.getAttribute('media')?.includes('$Time$') || false,
            mimeType,
            codecs,
            timeline,
            resolution: width && height ? `${width}x${height}` : undefined,
            bandwidth: parseInt(representation.getAttribute('bandwidth') || '0'),
            totalDuration,
        };
    }
}