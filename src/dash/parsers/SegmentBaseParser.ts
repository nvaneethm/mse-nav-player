import { SegmentTemplateInfo } from '../types';
import { IRepresentationParser, RepresentationContext } from './ParseContext';
import {
  getMimeType,
  getCodecs,
  getRepresentationID,
} from './helpers';

/**
 * Parses DASH representations that use SegmentBase — single-file MP4s where
 * segments are accessed via HTTP byte-range requests.
 *
 * Common in on-demand streams packaged with tools like Shaka Packager (e.g. Sintel).
 * The MPD provides:
 *   - A BaseURL pointing to the full MP4 file
 *   - SegmentBase/@indexRange — byte range of the sidx (segment index) box
 *   - SegmentBase/Initialization/@range — byte range of the init data (ftyp + moov)
 *
 * Playback requires Range-header fetching support in SegmentFetcher, which is
 * signalled by the presence of segmentBaseInitRange / segmentBaseIndexRange on
 * the returned SegmentTemplateInfo.
 */
export class SegmentBaseParser implements IRepresentationParser {
  canParse(ctx: RepresentationContext): boolean {
    const { representation, adaptationSet } = ctx;
    return !!(
      representation.querySelector(':scope > SegmentBase') ||
      adaptationSet.querySelector(':scope > SegmentBase')
    );
  }

  parse(ctx: RepresentationContext): SegmentTemplateInfo {
    const { representation, adaptationSet, mpdBase, totalDuration, periodStart } = ctx;

    const segmentBase =
      representation.querySelector(':scope > SegmentBase') ||
      adaptationSet.querySelector(':scope > SegmentBase');

    const mimeType = getMimeType(representation, adaptationSet);
    const codecs = getCodecs(representation, adaptationSet, mimeType);
    const bandwidth = parseInt(representation.getAttribute('bandwidth') || '0');
    const representationID = getRepresentationID(representation);
    const width = representation.getAttribute('width');
    const height = representation.getAttribute('height');

    // Resolve the file URL from BaseURL element (required for SegmentBase)
    const baseURLText =
      representation.querySelector(':scope > BaseURL')?.textContent?.trim() ||
      adaptationSet.querySelector(':scope > BaseURL')?.textContent?.trim() ||
      '';
    const fileURL = new URL(baseURLText || '.', mpdBase).href;

    const timescale = parseInt(segmentBase?.getAttribute('timescale') || '1');
    const indexRange = segmentBase?.getAttribute('indexRange') || undefined;
    const initEl = segmentBase?.querySelector('Initialization');
    const initRange = initEl?.getAttribute('range') || undefined;

    return {
      baseURL: fileURL,
      representationID,
      // Empty strings signal SegmentBase mode to SegmentURLGenerator
      initialization: '',
      media: '',
      startNumber: 1,
      timescale,
      duration: 0,
      useTimeTemplate: false,
      mimeType,
      codecs,
      resolution: width && height ? `${width}x${height}` : undefined,
      bandwidth,
      totalDuration,
      segmentBaseInitRange: initRange,
      segmentBaseIndexRange: indexRange,
      periodStart,
    };
  }
}
