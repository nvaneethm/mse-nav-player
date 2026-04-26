import { SegmentTemplateInfo } from '../types';
import { IRepresentationParser, RepresentationContext } from './ParseContext';
import {
  getMimeType,
  getCodecs,
  isTextTrack,
  getSegmentTemplate,
  getRepresentationID,
} from './helpers';

/**
 * Parses text-track representations that are delivered as sidecar files
 * (e.g. a single .webvtt file referenced by a BaseURL element).
 *
 * These tracks have no SegmentTemplate or SegmentBase — the BaseURL IS the
 * complete subtitle file URL. TextTrackHandler detects this mode via media === ''.
 *
 * Example MPD snippet:
 *   <AdaptationSet contentType="text" lang="en">
 *     <Representation bandwidth="256" mimeType="text/vtt">
 *       <BaseURL>s-eng.webvtt</BaseURL>
 *     </Representation>
 *   </AdaptationSet>
 */
export class SidecarTextParser implements IRepresentationParser {
  canParse(ctx: RepresentationContext): boolean {
    const { representation, adaptationSet } = ctx;
    const mimeType = getMimeType(representation, adaptationSet);
    const codecs = getCodecs(representation, adaptationSet, mimeType);

    if (!isTextTrack(mimeType, codecs, adaptationSet)) return false;
    if (getSegmentTemplate(representation, adaptationSet)) return false; // has template → not sidecar

    const hasBaseURL = !!(
      representation.querySelector(':scope > BaseURL') ||
      adaptationSet.querySelector(':scope > BaseURL')
    );
    return hasBaseURL;
  }

  parse(ctx: RepresentationContext): SegmentTemplateInfo {
    const { representation, adaptationSet, mpdBase, totalDuration, periodStart } = ctx;

    const mimeType = getMimeType(representation, adaptationSet);
    const codecs = getCodecs(representation, adaptationSet, mimeType);
    const bandwidth = parseInt(representation.getAttribute('bandwidth') || '0');
    const representationID = getRepresentationID(representation);

    const baseURLText =
      representation.querySelector(':scope > BaseURL')?.textContent?.trim() ||
      adaptationSet.querySelector(':scope > BaseURL')?.textContent?.trim() ||
      '';
    const sidecarURL = new URL(baseURLText, mpdBase).href;

    return {
      baseURL: sidecarURL,
      representationID,
      initialization: '',
      media: '', // signals sidecar mode — TextTrackHandler fetches baseURL directly
      startNumber: 1,
      timescale: 1,
      duration: 0,
      useTimeTemplate: false,
      mimeType,
      codecs: codecs || 'vtt',
      trackType: 'text',
      language:
        adaptationSet.getAttribute('lang') ||
        representation.getAttribute('lang') ||
        undefined,
      role:
        adaptationSet.querySelector('Role')?.getAttribute('value') || undefined,
      bandwidth,
      totalDuration,
      periodStart,
    };
  }
}
