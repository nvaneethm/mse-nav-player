import { HLSMediaSegment } from "./types";

export class HLSSegmentURLGenerator {
    private segments: HLSMediaSegment[];
    private index: number = 0;

    constructor(segments: HLSMediaSegment[]) {
        this.segments = segments;
    }

    getNextSegmentURL(): string | null {
        if (this.index >= this.segments.length) return null;
        return this.segments[this.index++].uri;
    }
}