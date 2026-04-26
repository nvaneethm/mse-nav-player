import { TimelineModel, TimelineSegment } from '../types/timeline.js';

export interface ParsedMPD {
  videoTracks: SegmentTemplateInfo[];
  audioTracks: SegmentTemplateInfo[];
  textTracks: SegmentTemplateInfo[];
  isLive: boolean;
  minimumUpdatePeriod?: number;   // ms
  availabilityStartTime?: Date;
  timeShiftBufferDepth?: number;  // seconds
}

export interface SegmentTemplateInfo {
  baseURL: string;
  representationID: string;
  initialization: string;
  media: string;
  startNumber: number;
  timescale: number;
  duration: number;
  useTimeTemplate: boolean;
  mimeType: string;
  codecs: string;
  timeline?: number[];
  resolution?: string;
  bandwidth: number;
  totalDuration?: number;
  trackType?: 'video' | 'audio' | 'text';
  language?: string;
  role?: string;
  /** SegmentBase: byte range of the init segment (ftyp+moov), e.g. "0-836" */
  segmentBaseInitRange?: string;
  /** SegmentBase: byte range of the segment index (sidx box), e.g. "837-3532" */
  segmentBaseIndexRange?: string;
  /** SegmentList: pre-resolved absolute URLs for each segment, in order */
  segmentListURLs?: string[];
  /** SegmentBase: pre-computed byte ranges per segment (populated after SIDX parsing) */
  segmentBaseByteRanges?: string[];
  /** Multi-period: start time of the period this track belongs to, in seconds */
  periodStart?: number;
}

export interface SegmentDownloadResult {
  url: string;
  data: ArrayBuffer;
  downloadBandwidth?: number; // bits per second, measured during fetch
}

export { TimelineModel, TimelineSegment };