export interface TimelineSegment {
    start: number;               // in seconds
    end: number;                 // in seconds
    url: string;                 // media segment URL
    type: "content" | "ad";      // distinguish type
}

export interface TimelineModel {
    getSegmentForTime(time: number): TimelineSegment | undefined;
} 