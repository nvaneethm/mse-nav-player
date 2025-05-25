import { SegmentTemplateInfo } from './types';

export class SegmentURLGenerator {
  public segmentDurationSeconds: number;
  private baseURL: string;
  private representationID: string;
  private initTemplate: string;
  private mediaTemplate: string;
  private useTimeTemplate: boolean;
  private info: SegmentTemplateInfo;

  constructor(private SegmentInfo: SegmentTemplateInfo) {
    this.info = SegmentInfo
    this.segmentDurationSeconds = SegmentInfo.duration / SegmentInfo.timescale
    this.baseURL = SegmentInfo.baseURL || '';
    this.representationID = SegmentInfo.representationID;
    this.initTemplate = SegmentInfo.initialization;
    this.mediaTemplate = SegmentInfo.media;
    this.useTimeTemplate = SegmentInfo.useTimeTemplate ?? SegmentInfo.media.indexOf('$Time$') !== -1;
  }

  getInitializationURL(): string {
    return this.resolveTemplate(this.initTemplate);
  }

  getInfo(): SegmentTemplateInfo {
    return this.info;
  }

  getMediaSegmentURL(index: number): string {
    if (this.info.useTimeTemplate && this.info.timeline) {
      const time = this.info.timeline[index];
      return this.resolveTemplate(this.info.media, undefined, time);
    } else {
      const number = this.info.startNumber + index;
      return this.resolveTemplate(this.mediaTemplate, number);
    }
  }

  private resolveTemplate(template: string, number?: number, time?: number): string {
    let resolved = template.replace('$RepresentationID$', this.representationID);
    if (number !== undefined) {
      resolved = resolved.replace('$Number$', number.toString());
    }
    if (time !== undefined) {
      resolved = resolved.replace('$Time$', time.toString());
    }
    return this.baseURL + resolved;
  }

  private computeSegmentTime(index: number): number {
    return index * this.info.duration; // simplified, can be replaced with timeline later
  }
}