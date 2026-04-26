import { SegmentTemplateInfo } from '../types';
import { IRepresentationParser, RepresentationContext } from './ParseContext';
import {
  getMimeType,
  getCodecs,
  getSegmentTemplate,
  parseSegmentTimeline,
  resolveBaseURL,
  getRepresentationID,
} from './helpers';

/**
 * Parses DASH representations that use a SegmentTemplate element.
 * This is the most common format for adaptive DASH streams.
 *
 * Supports:
 * - $Number$-based templates (e.g. seg_$Number$.m4s)
 * - $Time$-based templates with SegmentTimeline
 * - $Bandwidth$ and $RepresentationID$ substitutions
 * - Period-level, AdaptationSet-level, and Representation-level SegmentTemplate
 */
export class SegmentTemplateParser implements IRepresentationParser {
  canParse(ctx: RepresentationContext): boolean {
    return !!getSegmentTemplate(ctx.representation, ctx.adaptationSet);
  }

  parse(ctx: RepresentationContext): SegmentTemplateInfo {
    const { representation, adaptationSet, mpdBase, mpdBaseURL, totalDuration, periodStart } = ctx;

    const segmentTemplate = getSegmentTemplate(representation, adaptationSet)!;
    const mimeType = getMimeType(representation, adaptationSet);
    const codecs = getCodecs(representation, adaptationSet, mimeType);
    const baseURL = resolveBaseURL(representation, adaptationSet, mpdBase, mpdBaseURL);
    const representationID = getRepresentationID(representation);
    const bandwidth = parseInt(representation.getAttribute('bandwidth') || '0');
    const width = representation.getAttribute('width');
    const height = representation.getAttribute('height');

    const initialization = segmentTemplate.getAttribute('initialization') || '';
    const media = segmentTemplate.getAttribute('media') || '';

    if (!media) {
      throw new Error(`Missing media template for representation ${representationID}`);
    }

    const timescale = parseInt(segmentTemplate.getAttribute('timescale') || '1');
    const timeline = parseSegmentTimeline(segmentTemplate, totalDuration, timescale);
    const useTimeTemplate = media.includes('$Time$');

    // For $Time$ templates the segment duration comes from SegmentTimeline, not the
    // optional `duration` attribute. Derive it from consecutive timeline entries so
    // that TimelineModel and SegmentURLGenerator have a meaningful value for seeking.
    let duration: number;
    const durationAttr = parseInt(segmentTemplate.getAttribute('duration') || '0');
    if (useTimeTemplate && timeline && timeline.length >= 2) {
      duration = timeline[1] - timeline[0]; // first segment's duration in timescale units
    } else if (durationAttr > 0) {
      duration = durationAttr;
    } else {
      duration = timescale * 2; // fallback: assume 2s segments
    }

    return {
      baseURL,
      representationID,
      initialization,
      media,
      startNumber: parseInt(segmentTemplate.getAttribute('startNumber') || '1'),
      timescale,
      duration,
      useTimeTemplate,
      mimeType,
      codecs,
      timeline,
      resolution: width && height ? `${width}x${height}` : undefined,
      bandwidth,
      totalDuration,
      periodStart,
    };
  }
}
