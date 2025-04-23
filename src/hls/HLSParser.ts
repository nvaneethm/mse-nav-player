import { HLSMediaSegment, HLSTrackInfo } from "./types";
import { logger } from "../utils/Logger";
import { resolveUrl } from "../utils";


export class HLSParser {
  async isMaster(url: string): Promise<boolean> {
    const response = await fetch(url);
    const text = await response.text();
    return text.includes("#EXT-X-STREAM-INF");
  }

  async parseMasterPlaylist(url: string): Promise<string> {
    const response = await fetch(url);
    const text = await response.text();
    const lines = text.split("\n");
    const baseURL = new URL(".", url).href;

    let selectedVariant: string | null = null;
    let maxBandwidth = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      if (line.startsWith("#EXT-X-STREAM-INF")) {
        const bwMatch = line.match(/BANDWIDTH=(\d+)/);
        const bandwidth = bwMatch ? parseInt(bwMatch[1]) : 0;

        let j = i + 1;
        while (j < lines.length && (lines[j].trim() === "" || lines[j].startsWith("#"))) {
          j++;
        }

        const uri = lines[j]?.trim();
        if (uri) {
          const fullUri = resolveUrl(uri, baseURL);
          if (!selectedVariant || bandwidth > maxBandwidth) {
            selectedVariant = fullUri;
            maxBandwidth = bandwidth;
          }
        }
      }
    }

    if (!selectedVariant) {
      throw new Error("No playable variant found in master playlist");
    }

    logger.info("[HLSParser] Selected variant:", selectedVariant);
    return selectedVariant;
  }

  async parseMediaPlaylist(url: string): Promise<HLSTrackInfo> {
    const response = await fetch(url);
    const text = await response.text();
    const lines = text.split("\n");
    const baseURL = new URL(".", url).href;

    logger.info("[HLSParser] Using media playlist base:", baseURL);

    const segments: HLSMediaSegment[] = [];
    let currentDuration = 0;
    let initSegmentUri: string | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      logger.debug("[HLSParser] Parsing line:", line);

      if (line.startsWith("#EXT-X-MAP:")) {
        const match = line.match(/URI="([^"]+)"/);
        if (match) {
          initSegmentUri = resolveUrl(match[1], baseURL);
        }
      } else if (line.startsWith("#EXTINF:")) {
        currentDuration = parseFloat(line.split(":")[1]);
      } else if (line && !line.startsWith("#")) {
        const fullUri = resolveUrl(line, baseURL);
        segments.push({
          uri: fullUri,
          duration: currentDuration,
        });
        currentDuration = 0;
      }
    }

    if (!segments.length) {
      throw new Error("No media segments found in media playlist");
    }

    return {
      baseURL,
      segments,
      initSegment: initSegmentUri || undefined
    };
  }
}