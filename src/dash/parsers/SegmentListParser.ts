import { SegmentTemplateInfo } from '../types';
import { IRepresentationParser, RepresentationContext } from './ParseContext';
import {
  getMimeType,
  getCodecs,
  resolveBaseURL,
  getRepresentationID,
} from './helpers';

/**
 * Parses DASH representations that use a SegmentList element.
 *
 * Instead of a URL template, SegmentList explicitly enumerates every segment
 * as a <SegmentURL> child element. Common in:
 * - AWS MediaPackage outputs
 * - Older packagers (MP4Box, Bento4)
 * - Static on-demand packaging workflows
 *
 * Example MPD snippet:
 *   <SegmentList timescale="90000" duration="180000">
 *     <Initialization sourceURL="init.mp4"/>
 *     <SegmentURL media="seg-1.m4s"/>
 *     <SegmentURL media="seg-2.m4s"/>
 *   </SegmentList>
 *
 * The parsed result maps each <SegmentURL> to an entry in `segmentListURLs`.
 * SegmentURLGenerator detects this mode via `segmentListURLs` being present
 * and returns URLs by index lookup instead of template substitution.
 */
export class SegmentListParser implements IRepresentationParser {
  canParse(ctx: RepresentationContext): boolean {
    const { representation, adaptationSet } = ctx;
    return !!(
      representation.querySelector(':scope > SegmentList') ||
      adaptationSet.querySelector(':scope > SegmentList')
    );
  }

  parse(ctx: RepresentationContext): SegmentTemplateInfo {
    const { representation, adaptationSet, mpdBase, mpdBaseURL, totalDuration, periodStart } = ctx;

    const segmentList =
      representation.querySelector(':scope > SegmentList') ||
      adaptationSet.querySelector(':scope > SegmentList')!;

    const mimeType = getMimeType(representation, adaptationSet);
    const codecs = getCodecs(representation, adaptationSet, mimeType);
    const baseURL = resolveBaseURL(representation, adaptationSet, mpdBase, mpdBaseURL);
    const representationID = getRepresentationID(representation);
    const bandwidth = parseInt(representation.getAttribute('bandwidth') || '0');
    const width = representation.getAttribute('width');
    const height = representation.getAttribute('height');

    const timescale = parseInt(segmentList.getAttribute('timescale') || '1');
    const duration = parseInt(segmentList.getAttribute('duration') || '0');
    const startNumber = parseInt(segmentList.getAttribute('startNumber') || '1');

    // Resolve the initialization segment URL
    const initEl = segmentList.querySelector('Initialization');
    const initialization = initEl
      ? new URL(initEl.getAttribute('sourceURL') || '', baseURL).href
      : '';

    // Collect all segment URLs in order
    const segmentListURLs = Array.from(segmentList.querySelectorAll('SegmentURL'))
      .map(el => {
        const media = el.getAttribute('media') || '';
        return new URL(media, baseURL).href;
      });

    return {
      baseURL,
      representationID,
      initialization,
      media: '',       // not used in SegmentList mode
      startNumber,
      timescale,
      duration,
      useTimeTemplate: false,
      mimeType,
      codecs,
      resolution: width && height ? `${width}x${height}` : undefined,
      bandwidth,
      totalDuration,
      segmentListURLs,
      periodStart,
    };
  }
}
