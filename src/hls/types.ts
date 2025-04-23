export interface HLSMediaSegment {
  uri: string;
  duration: number;
}

export interface HLSTrackInfo {
  baseURL: string;
  segments: HLSMediaSegment[];
  initSegment?: string;
}

export interface SegmentTemplateInfo {
  baseURL: string;
  representationID: string;
  initialization: string;
  media: string;
  startNumber: number;
  timescale: number;
  duration: number;
  useTimeTemplate?: boolean;
  mimeType?: string;
  codecs?: string;
  segments?: HLSMediaSegment[]; // for HLS
}