import { logger } from "../utils/Logger";
import { SegmentTemplateInfo } from "./types";

export class MPDParser {
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
            const representations = Array.from(set.querySelectorAll('Representation'));
            for (const representation of representations) {
                const mimeType =
                    representation?.getAttribute('mimeType') ||
                    set.getAttribute('mimeType') ||
                    set.querySelector('ContentComponent')?.getAttribute('contentType') ||
                    '';
                const codecs =
                    representation?.getAttribute('codecs') ||
                    set.getAttribute('codecs') ||
                    (mimeType.includes('video') ? 'avc1.42E01E' :
                        mimeType.includes('audio') ? 'mp4a.40.2' : '');
                const segmentTemplate =
                    representation?.querySelector('SegmentTemplate') ||
                    set.querySelector('SegmentTemplate');
                if (!representation || !segmentTemplate) continue;

                const baseTag = set.querySelector('BaseURL')?.textContent ?? '';
                const baseURL = new URL(baseTag || '.', mpdBase).href;

                const width = representation.getAttribute('width');
                const height = representation.getAttribute('height');

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

                const info: SegmentTemplateInfo = {
                    baseURL,
                    representationID: representation.getAttribute('id') || '',
                    initialization: segmentTemplate.getAttribute('initialization') || '',
                    media: segmentTemplate.getAttribute('media') || '',
                    startNumber: parseInt(segmentTemplate.getAttribute('startNumber') || '1'),
                    timescale: parseInt(segmentTemplate.getAttribute('timescale') || '1'),
                    duration: parseInt(segmentTemplate.getAttribute('duration') || '1'),
                    useTimeTemplate: segmentTemplate.getAttribute('media')?.includes('$Time$') || false,
                    mimeType,
                    codecs,
                    timeline: timeline.length > 0 ? timeline : undefined,
                    resolution: width && height ? `${width}x${height}` : undefined,
                    bandwidth: parseInt(representation.getAttribute('bandwidth') || '0'),

                };

                if (mimeType.includes('audio')) {
                    audioTracks.push(info);
                } else if (mimeType.includes('video')) {
                    videoTracks.push(info);
                }
            }
        }

        logger.debug('[MPDParser] Parsed videoTracks:', videoTracks);
        logger.debug('[MPDParser] Parsed audioTracks:', audioTracks);



        return { videoTracks, audioTracks };
    }
}