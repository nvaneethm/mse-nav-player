import { SegmentTemplateInfo } from '../types';

/**
 * Context passed to every representation parser containing the XML elements
 * and derived metadata needed to build a SegmentTemplateInfo.
 */
export interface RepresentationContext {
  representation: Element;
  adaptationSet: Element;
  /** Resolved base URL of the MPD document itself (used to resolve relative URLs). */
  mpdBase: string;
  /** Raw BaseURL text from the MPD root or Period element (may be relative). */
  mpdBaseURL: string;
  /** Total presentation duration in seconds (0 for live). */
  totalDuration: number;
  /** Start time of this period in seconds within the overall presentation (0 for single-period). */
  periodStart: number;
}

/**
 * All representation parsers implement this interface.
 * MPDParser tries each parser in order; the first one that returns true from
 * canParse() is used.
 */
export interface IRepresentationParser {
  canParse(ctx: RepresentationContext): boolean;
  parse(ctx: RepresentationContext): SegmentTemplateInfo;
}
