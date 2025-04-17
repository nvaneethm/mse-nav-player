import { SegmentTemplateInfo } from './types';

export class SegmentURLGenerator {
  private baseURL: string;
  private representationID: string;
  private initTemplate: string;
  private mediaTemplate: string;
  private useTimeTemplate: boolean;

  constructor(private info: SegmentTemplateInfo) {
    this.baseURL = info.baseURL || '';
    this.representationID = info.representationID;
    this.initTemplate = info.initialization;
    this.mediaTemplate = info.media;
    this.useTimeTemplate = info.useTimeTemplate ?? info.media.indexOf('$Time$') !== -1;  }

  getInitializationURL(): string {
    return this.resolveTemplate(this.initTemplate);
  }

  getMediaSegmentURL(index: number): string {
    if (this.useTimeTemplate) {
      const time = this.computeSegmentTime(index);
      return this.resolveTemplate(this.mediaTemplate, undefined, time);
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