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
}

export interface SegmentDownloadResult {
  url: string;
  data: ArrayBuffer;
}