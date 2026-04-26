/**
 * Utilities for parsing live/dynamic DASH manifest attributes.
 */

/**
 * Parse ISO 8601 duration string (e.g. "PT5S", "PT1M30S", "P1DT2H") to seconds.
 */
export function parseISO8601Duration(duration: string): number {
  const re = /P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:([\d.]+)S)?/;
  const m = duration.match(re);
  if (!m) return 0;
  const [, years, months, days, hours, minutes, seconds] = m.map(v => parseFloat(v || '0'));
  return (years * 31_536_000) + (months * 2_592_000) + (days * 86_400) +
         (hours * 3_600) + (minutes * 60) + seconds;
}

/**
 * Extract live-specific attributes from an MPD root element.
 * All fields are undefined when the MPD is static (VOD).
 */
export function parseLiveAttributes(mpd: Element): {
  isLive: boolean;
  minimumUpdatePeriod?: number;
  availabilityStartTime?: Date;
  timeShiftBufferDepth?: number;
} {
  const isLive = mpd.getAttribute('type') === 'dynamic';

  let minimumUpdatePeriod: number | undefined;
  const mupStr = mpd.getAttribute('minimumUpdatePeriod');
  if (mupStr) minimumUpdatePeriod = parseISO8601Duration(mupStr) * 1000; // → ms

  let availabilityStartTime: Date | undefined;
  const astStr = mpd.getAttribute('availabilityStartTime');
  if (astStr) availabilityStartTime = new Date(astStr);

  let timeShiftBufferDepth: number | undefined;
  const tsbdStr = mpd.getAttribute('timeShiftBufferDepth');
  if (tsbdStr) timeShiftBufferDepth = parseISO8601Duration(tsbdStr);

  return { isLive, minimumUpdatePeriod, availabilityStartTime, timeShiftBufferDepth };
}
