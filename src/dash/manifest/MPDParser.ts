import { logger } from '../../utils/Logger';
import { SegmentTemplateInfo } from '../types';
import { parseLiveAttributes, parseISO8601Duration } from './liveUtils';
import { RepresentationContext } from '../parsers/ParseContext';
import { SegmentTemplateParser } from '../parsers/SegmentTemplateParser';
import { SegmentBaseParser } from '../parsers/SegmentBaseParser';
import { SidecarTextParser } from '../parsers/SidecarTextParser';
import { SegmentListParser } from '../parsers/SegmentListParser';
import { getMimeType, getCodecs, isTextTrack } from '../parsers/helpers';

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

/**
 * Orchestrates DASH manifest parsing by delegating each Representation to the
 * appropriate parser based on its segment delivery format:
 *
 *   SidecarTextParser     — text tracks with a plain BaseURL (.webvtt / .ttml files)
 *   SegmentBaseParser     — single-file MP4s accessed via HTTP byte-range (SegmentBase)
 *   SegmentTemplateParser — adaptive streams using a SegmentTemplate (most common)
 *
 * Parsers are tried in priority order; first match wins.
 */
export class MPDParser {
    private readonly REQUEST_TIMEOUT = 10_000;
    private readonly MAX_MANIFEST_SIZE = 1024 * 1024; // 1 MB

    private readonly parsers = [
        new SidecarTextParser(),
        new SegmentBaseParser(),
        new SegmentListParser(),
        new SegmentTemplateParser(),
    ];

    async parse(url: string): Promise<{
        videoTracks: SegmentTemplateInfo[];
        audioTracks: SegmentTemplateInfo[];
        textTracks: SegmentTemplateInfo[];
        isLive: boolean;
        minimumUpdatePeriod?: number;
        availabilityStartTime?: Date;
        timeShiftBufferDepth?: number;
    }> {
        logger.info('[MPDParser] Fetching manifest:', url);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.REQUEST_TIMEOUT);

        try {
            const response = await fetch(url, { signal: controller.signal });
            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new MPDParseError(`Failed to fetch MPD: ${response.status}`, url);
            }

            const contentLength = response.headers.get('content-length');
            if (contentLength && parseInt(contentLength) > this.MAX_MANIFEST_SIZE) {
                throw new MPDParseError(
                    `Manifest exceeds max size of ${this.MAX_MANIFEST_SIZE} bytes`, url
                );
            }

            const xmlText = await response.text();
            return this.parseXML(xmlText, url);
        } catch (err) {
            clearTimeout(timeoutId);
            if (err instanceof Error && err.name === 'AbortError') {
                throw new MPDParseError('Manifest fetch timeout', url);
            }
            if (err instanceof MPDParseError) throw err;
            throw new MPDParseError('Failed to parse MPD', url, err);
        }
    }

    async parseVideo(url: string): Promise<SegmentTemplateInfo[]> {
        return (await this.parse(url)).videoTracks;
    }

    async parseAudio(url: string): Promise<SegmentTemplateInfo[]> {
        return (await this.parse(url)).audioTracks;
    }

    private parseXML(xmlText: string, url: string): ReturnType<MPDParser['parse']> extends Promise<infer T> ? T : never {
        const xml = new DOMParser().parseFromString(xmlText, 'application/xml');

        const parserError = xml.querySelector('parsererror');
        if (parserError) {
            throw new MPDParseError('Failed to parse MPD XML', url, parserError.textContent);
        }

        const mpd = xml.querySelector('MPD');
        if (!mpd) throw new MPDParseError('Missing MPD root element', url);

        const liveAttrs = parseLiveAttributes(mpd);

        let totalDuration = 0;
        const durationStr = mpd.getAttribute('mediaPresentationDuration');
        if (durationStr) {
            const m = durationStr.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:([\d.]+)S)?/);
            if (m) {
                totalDuration =
                    (parseFloat(m[1] || '0') * 3600) +
                    (parseFloat(m[2] || '0') * 60) +
                    parseFloat(m[3] || '0');
            }
        }

        const mpdBaseURL = mpd.querySelector(':scope > BaseURL')?.textContent?.trim() || '.';
        const mpdBase = new URL(mpdBaseURL, url).href;

        const periods = Array.from(mpd.querySelectorAll(':scope > Period'));
        if (periods.length === 0) {
            throw new MPDParseError('No Period elements found', url);
        }

        logger.info(`[MPDParser] Found ${periods.length} period(s)`);

        const videoTracks: SegmentTemplateInfo[] = [];
        const audioTracks: SegmentTemplateInfo[] = [];
        const textTracks: SegmentTemplateInfo[] = [];

        // Compute period start times for multi-period timelines
        let periodStart = 0;
        for (const period of periods) {
            const periodStartAttr = period.getAttribute('start');
            if (periodStartAttr) {
                periodStart = parseISO8601Duration(periodStartAttr);
            }
            const periodDurationAttr = period.getAttribute('duration');
            const periodDuration = periodDurationAttr
                ? parseISO8601Duration(periodDurationAttr)
                : totalDuration;

            // Period-level BaseURL overrides MPD-level
            const periodBaseURL = period.querySelector(':scope > BaseURL')?.textContent?.trim() || mpdBaseURL;
            const periodBase = new URL(periodBaseURL, mpdBase).href;

            const adaptationSets = Array.from(period.querySelectorAll(':scope > AdaptationSet'));
            for (const adaptationSet of adaptationSets) {
                for (const representation of Array.from(adaptationSet.querySelectorAll('Representation'))) {
                    const ctx: RepresentationContext = {
                        representation,
                        adaptationSet,
                        mpdBase: periodBase,
                        mpdBaseURL: periodBaseURL,
                        totalDuration: periodDuration,
                        periodStart,
                    };

                    const parser = this.parsers.find(p => p.canParse(ctx));
                    if (!parser) {
                        logger.warn('[MPDParser] No parser matched representation — skipping');
                        continue;
                    }

                    // Skip WebM (VP9/Opus) — MSE requires a separate codec path not yet implemented
                    const rawMime = getMimeType(representation, adaptationSet);
                    if (rawMime.includes('webm')) {
                        logger.debug('[MPDParser] Skipping WebM representation (not yet supported)');
                        continue;
                    }

                    try {
                        const info = parser.parse(ctx);
                        this.classifyTrack(info, representation, adaptationSet,
                            videoTracks, audioTracks, textTracks);
                    } catch (err) {
                        logger.warn('[MPDParser] Failed to parse representation:', err);
                    }
                }
            }

            // Advance period start for implicit next period
            periodStart += periodDuration;
        }

        if (videoTracks.length === 0) {
            throw new MPDParseError('No valid video tracks found', url);
        }

        logger.info(`[MPDParser] Parsed ${videoTracks.length} video, ${audioTracks.length} audio, ${textTracks.length} text tracks`);
        return { videoTracks, audioTracks, textTracks, ...liveAttrs };
    }

    private classifyTrack(
        info: SegmentTemplateInfo,
        representation: Element,
        adaptationSet: Element,
        videoTracks: SegmentTemplateInfo[],
        audioTracks: SegmentTemplateInfo[],
        textTracks: SegmentTemplateInfo[]
    ): void {
        const mimeType = getMimeType(representation, adaptationSet);
        const codecs = getCodecs(representation, adaptationSet, mimeType);

        if (info.trackType === 'text' || isTextTrack(mimeType, codecs, adaptationSet)) {
            info.trackType = 'text';
            info.language ??= adaptationSet.getAttribute('lang') || representation.getAttribute('lang') || undefined;
            info.role ??= adaptationSet.querySelector('Role')?.getAttribute('value') || undefined;
            textTracks.push(info);
        } else if (mimeType.includes('audio')) {
            info.trackType = 'audio';
            info.language ??= adaptationSet.getAttribute('lang') || undefined;
            audioTracks.push(info);
        } else if (mimeType.includes('video')) {
            info.trackType = 'video';
            videoTracks.push(info);
        } else {
            logger.warn('[MPDParser] Unknown track type, skipping:', mimeType);
        }
    }
}
