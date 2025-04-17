export interface SegmentTemplateInfo {
    baseURL: string;
    representationID: string;
    initialization: string;
    media: string;
    startNumber: number;
    timescale: number;
    duration: number;
    segmentTimeline?: Array<{ t?: number; d: number; r?: number }>; // for future Timeline support
    useTimeTemplate?: boolean; // if true, resolve $Time$, else $Number$
  }