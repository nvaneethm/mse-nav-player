import { SegmentTemplateInfo } from '../dash/types';
import { SegmentFetcher } from '../dash/SegmentFetcher';
import { SegmentURLGenerator } from '../dash/SegmentURLGenerator';
import { logger } from '../utils/Logger';

interface ManagedTextTrack {
  info: SegmentTemplateInfo;
  track: TextTrack;
  loaded: boolean;
}

/**
 * Handles subtitle and caption tracks parsed from a DASH manifest.
 *
 * Supports:
 * - WebVTT (.vtt) sidecar files (single-file via initialization URL)
 * - Segmented WebVTT / TTML delivered in MP4 (wvtt / stpp codecs)
 *
 * Uses the native HTMLVideoElement TextTrack API — no MSE SourceBuffer needed
 * for text tracks.
 */
export class TextTrackHandler {
  private readonly videoEl: HTMLVideoElement;
  private readonly fetcher: SegmentFetcher;
  private tracks: Map<string, ManagedTextTrack> = new Map();

  constructor(videoEl: HTMLVideoElement, fetcher: SegmentFetcher) {
    this.videoEl = videoEl;
    this.fetcher = fetcher;
  }

  /**
   * Register a text track from the MPD. Does not fetch content yet.
   */
  addTrack(info: SegmentTemplateInfo): void {
    const language = info.language || 'und';
    if (this.tracks.has(language)) return;

    const track = this.videoEl.addTextTrack('subtitles', info.role || 'subtitles', language);
    track.mode = 'hidden'; // hidden until explicitly enabled
    this.tracks.set(language, { info, track, loaded: false });
    logger.info(`[TextTrackHandler] Registered text track: lang=${language} role=${info.role}`);
  }

  /**
   * Enable a text track by language code and load its cues if not yet loaded.
   */
  async enable(language: string): Promise<void> {
    const entry = this.tracks.get(language);
    if (!entry) {
      logger.warn(`[TextTrackHandler] No track for language: ${language}`);
      return;
    }

    // Disable all other tracks
    for (const [lang, e] of this.tracks) {
      if (lang !== language) e.track.mode = 'hidden';
    }

    entry.track.mode = 'showing';

    if (!entry.loaded) {
      await this.loadCues(entry);
    }
  }

  disable(): void {
    for (const entry of this.tracks.values()) {
      entry.track.mode = 'hidden';
    }
  }

  getAvailableTracks(): { language: string; role?: string }[] {
    return Array.from(this.tracks.entries()).map(([language, e]) => ({
      language,
      role: e.info.role,
    }));
  }

  private async loadCues(entry: ManagedTextTrack): Promise<void> {
    const { info, track } = entry;
    const generator = new SegmentURLGenerator(info);
    const codecs = info.codecs || '';

    try {
      if (info.mimeType.includes('vtt') || info.mimeType.includes('text/vtt')) {
        // Plain WebVTT sidecar file — treat init URL as the full VTT file URL
        const url = generator.getInitializationURL();
        const result = await this.fetcher.fetchSegment(url);
        const text = new TextDecoder().decode(result.data);
        this.parseVTT(text, track);
      } else if (codecs.includes('wvtt') || codecs.includes('stpp')) {
        // Segmented text in MP4 — fetch each segment and extract cues
        const segmentCount = generator.getLastSegmentIndex() + 1;
        for (let i = 0; i < segmentCount; i++) {
          const url = generator.getMediaSegmentURL(i);
          const result = await this.fetcher.fetchSegment(url);
          if (codecs.includes('wvtt')) {
            this.parseWVTTFromMP4(result.data, track, i, info);
          } else {
            this.parseSTPPFromMP4(result.data, track);
          }
        }
      } else {
        // Fallback: try fetching init as plain text
        const url = generator.getInitializationURL();
        const result = await this.fetcher.fetchSegment(url);
        const text = new TextDecoder().decode(result.data);
        if (text.startsWith('WEBVTT')) {
          this.parseVTT(text, track);
        }
      }
      entry.loaded = true;
      logger.info(`[TextTrackHandler] Loaded cues for lang=${info.language}`);
    } catch (err) {
      logger.error(`[TextTrackHandler] Failed to load cues for lang=${info.language}:`, err);
    }
  }

  /**
   * Parse a plain WebVTT string and insert cues into the TextTrack.
   */
  private parseVTT(vttText: string, track: TextTrack): void {
    const lines = vttText.split(/\r?\n/);
    let i = 0;

    // Skip WEBVTT header and any NOTE/STYLE blocks
    while (i < lines.length && !lines[i].includes('-->')) i++;

    while (i < lines.length) {
      const line = lines[i].trim();
      if (line.includes('-->')) {
        const [startStr, endStr] = line.split('-->').map(s => s.trim());
        const start = this.parseVTTTimestamp(startStr);
        const end = this.parseVTTTimestamp(endStr.split(' ')[0]); // strip cue settings
        const textLines: string[] = [];
        i++;
        while (i < lines.length && lines[i].trim() !== '') {
          textLines.push(lines[i]);
          i++;
        }
        if (textLines.length > 0) {
          try {
            const cue = new VTTCue(start, end, textLines.join('\n'));
            track.addCue(cue);
          } catch (e) {
            logger.warn('[TextTrackHandler] Failed to add VTT cue:', e);
          }
        }
      }
      i++;
    }
  }

  private parseVTTTimestamp(ts: string): number {
    const parts = ts.trim().split(':').map(Number);
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return parts[0];
  }

  /**
   * Extract WebVTT payload from a wvtt MP4 segment.
   * The vttc box contains a payl box with the VTT cue text.
   * Timing comes from the mdhd/tfdt boxes but we approximate using segment index.
   */
  private parseWVTTFromMP4(buffer: ArrayBuffer, track: TextTrack, segIndex: number, info: SegmentTemplateInfo): void {
    const data = new Uint8Array(buffer);
    const segDuration = info.duration / info.timescale;
    const baseTime = segIndex * segDuration;
    let offset = 0;

    while (offset + 8 <= data.length) {
      const size = this.readUint32(data, offset);
      const type = String.fromCharCode(data[offset + 4], data[offset + 5], data[offset + 6], data[offset + 7]);

      if (type === 'vttc' && size > 8) {
        // Look for payl box inside vttc
        let inner = offset + 8;
        while (inner + 8 <= offset + size) {
          const innerSize = this.readUint32(data, inner);
          const innerType = String.fromCharCode(data[inner + 4], data[inner + 5], data[inner + 6], data[inner + 7]);
          if (innerType === 'payl' && innerSize > 8) {
            const text = new TextDecoder().decode(data.slice(inner + 8, inner + innerSize));
            try {
              const cue = new VTTCue(baseTime, baseTime + segDuration, text.trim());
              track.addCue(cue);
            } catch (e) {
              logger.warn('[TextTrackHandler] Failed to add wvtt cue:', e);
            }
          }
          inner += Math.max(innerSize, 1);
        }
      }

      offset += Math.max(size, 1);
    }
  }

  /**
   * Extract TTML payload from an stpp MP4 segment.
   * The mdat box contains an XML TTML document.
   */
  private parseSTPPFromMP4(buffer: ArrayBuffer, track: TextTrack): void {
    const data = new Uint8Array(buffer);
    let offset = 0;

    while (offset + 8 <= data.length) {
      const size = this.readUint32(data, offset);
      const type = String.fromCharCode(data[offset + 4], data[offset + 5], data[offset + 6], data[offset + 7]);

      if (type === 'mdat' && size > 8) {
        const xml = new TextDecoder().decode(data.slice(offset + 8, offset + size));
        this.parseTTML(xml, track);
        break;
      }

      offset += Math.max(size, 1);
    }
  }

  /**
   * Parse a TTML XML string and insert cues into the TextTrack.
   */
  private parseTTML(xmlStr: string, track: TextTrack): void {
    try {
      const doc = new DOMParser().parseFromString(xmlStr, 'application/xml');
      const ps = Array.from(doc.querySelectorAll('p'));
      for (const p of ps) {
        const begin = p.getAttribute('begin');
        const end = p.getAttribute('end');
        if (!begin || !end) continue;
        const start = this.parseTTMLTime(begin);
        const endTime = this.parseTTMLTime(end);
        const text = p.textContent?.trim() || '';
        if (text) {
          try {
            track.addCue(new VTTCue(start, endTime, text));
          } catch (e) {
            logger.warn('[TextTrackHandler] Failed to add TTML cue:', e);
          }
        }
      }
    } catch (err) {
      logger.warn('[TextTrackHandler] TTML parse error:', err);
    }
  }

  private parseTTMLTime(ts: string): number {
    // Supports HH:MM:SS.mmm and SS.mmm formats
    const parts = ts.split(':').map(parseFloat);
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return parts[0];
  }

  private readUint32(data: Uint8Array, offset: number): number {
    return (data[offset] << 24 | data[offset + 1] << 16 | data[offset + 2] << 8 | data[offset + 3]) >>> 0;
  }

  destroy(): void {
    this.tracks.clear();
  }
}
