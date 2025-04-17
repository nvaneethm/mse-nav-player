import { SegmentDownloadResult } from "./types";

export class SegmentFetcher {
    constructor(private maxRetries: number = 3) {}
  
    async fetchSegment(url: string): Promise<SegmentDownloadResult> {
      for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
        try {
          const response = await fetch(url);
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
  
          const buffer = await response.arrayBuffer();
          return { url, data: buffer };
        } catch (err) {
          console.warn(`[SegmentFetcher] Attempt ${attempt} failed for ${url}`, err);
  
          if (attempt === this.maxRetries) {
            throw new Error(`[SegmentFetcher] Failed after ${attempt} attempts: ${url}`);
          }
  
          await new Promise((res) => setTimeout(res, 100 * Math.pow(2, attempt)));
        }
      }
  
      // fallback, shouldn't hit
      throw new Error(`Unknown fetch failure for ${url}`);
    }
  }