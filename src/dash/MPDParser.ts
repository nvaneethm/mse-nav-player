import { logger } from "../utils/Logger";
import { SegmentTemplateInfo } from "./types";

export class MPDParser {
    async parse(url: string): Promise<SegmentTemplateInfo[]> {
        logger.info('[MPDParser] Fetching manifest:', url);

        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`[MPDParser] Failed to fetch MPD: ${response.status}`);
        }

        const xmlText = await response.text();
        const xml = new DOMParser().parseFromString(xmlText, 'application/xml');

        const mpdBase = new URL('.', url).href;
        const adaptationSets = Array.from(xml.querySelectorAll('AdaptationSet'));

        const videoTracks: SegmentTemplateInfo[] = [];
        const audioTracks: SegmentTemplateInfo[] = [];

        for (const set of adaptationSets) {
            const mimeType = set.getAttribute('mimeType') || '';
            const representation = set.querySelector('Representation');
            const segmentTemplate =
                representation?.querySelector('SegmentTemplate') ||
                set.querySelector('SegmentTemplate');
            if (!representation || !segmentTemplate) continue;

            const baseTag = set.querySelector('BaseURL')?.textContent ?? '';
            const baseURL = new URL(baseTag || '.', mpdBase).href;

            const info: SegmentTemplateInfo = {
                baseURL,
                representationID: representation.getAttribute('id') || '',
                initialization: segmentTemplate.getAttribute('initialization') || '',
                media: segmentTemplate.getAttribute('media') || '',
                startNumber: parseInt(segmentTemplate.getAttribute('startNumber') || '1'),
                timescale: parseInt(segmentTemplate.getAttribute('timescale') || '1'),
                duration: parseInt(segmentTemplate.getAttribute('duration') || '1'),
                useTimeTemplate: segmentTemplate.getAttribute('media')?.includes('$Time$') || false
            };

            if (mimeType.includes('audio')) {
                audioTracks.push(info);
            } else if (mimeType.includes('video')) {
                videoTracks.push(info);
            }
        }

        logger.debug('[MPDParser] Parsed videoTracks:', videoTracks);
        logger.debug('[MPDParser] Parsed audioTracks:', audioTracks);



        return [...videoTracks, ...audioTracks];
    }
}