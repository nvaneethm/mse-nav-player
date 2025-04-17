import { SegmentTemplateInfo } from './types.js';
import { logger } from '../utils/Logger.js';

const MPD_NS = 'urn:mpeg:dash:schema:mpd:2011';

export class MPDParser {
    async parse(url: string): Promise<SegmentTemplateInfo> {
        logger.info('[MPDParser] Fetching manifest:', url);

        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`[MPDParser] Failed to fetch MPD: ${response.status}`);
        }

        const xmlText = await response.text();
        const xml = new DOMParser().parseFromString(xmlText, 'application/xml');

        const adaptationSet = xml.querySelector('AdaptationSet[mimeType^="video"]');
        const representation = adaptationSet?.querySelector('Representation');
        const segmentTemplate = representation?.querySelector('SegmentTemplate') ||
            adaptationSet?.querySelector('SegmentTemplate');

        if (!segmentTemplate || !representation) {
            throw new Error('[MPDParser] No valid SegmentTemplate or Representation found.');
        }

        const explicitBase = adaptationSet?.querySelector('BaseURL')?.textContent;
        const mpdBase = new URL('.', url).href;
        const baseURL = explicitBase ? new URL(explicitBase, mpdBase).href : mpdBase;

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

        logger.debug('[MPDParser] Parsed SegmentTemplateInfo:', info);
        return info;
    }
}