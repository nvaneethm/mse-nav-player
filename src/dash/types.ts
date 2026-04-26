import { TimelineModel, TimelineSegment } from '../types/timeline.js';

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
}

export interface SegmentDownloadResult {
  url: string;
  data: ArrayBuffer;
  downloadBandwidth?: number; // bits per second, measured during fetch
}

export { TimelineModel, TimelineSegment };