/**
 * Shared helper functions used across representation parsers.
 */

export function getMimeType(representation: Element, adaptationSet: Element): string {
  return (
    representation.getAttribute('mimeType') ||
    adaptationSet.getAttribute('mimeType') ||
    adaptationSet.querySelector('ContentComponent')?.getAttribute('contentType') ||
    ''
  );
}

export function getCodecs(
  representation: Element,
  adaptationSet: Element,
  mimeType: string
): string {
  return (
    representation.getAttribute('codecs') ||
    adaptationSet.getAttribute('codecs') ||
    (mimeType.includes('video')
      ? 'avc1.42E01E'
      : mimeType.includes('audio')
      ? 'mp4a.40.2'
      : '')
  );
}

export function isTextTrack(mimeType: string, codecs: string, adaptationSet: Element): boolean {
  if (mimeType.includes('text') || mimeType.includes('ttml') || mimeType.includes('vtt'))
    return true;
  if (codecs.includes('stpp') || codecs.includes('wvtt')) return true;
  const contentType = adaptationSet
    .querySelector('ContentComponent')
    ?.getAttribute('contentType');
  if (contentType === 'text') return true;
  const setContentType = adaptationSet.getAttribute('contentType');
  if (setContentType === 'text') return true;
  if (
    mimeType === 'application/mp4' &&
    (codecs.includes('stpp') || codecs.includes('wvtt'))
  )
    return true;
  return false;
}

export function getSegmentTemplate(
  representation: Element,
  adaptationSet: Element
): Element | null {
  return (
    representation.querySelector(':scope > SegmentTemplate') ||
    adaptationSet.querySelector(':scope > SegmentTemplate') ||
    adaptationSet.parentElement?.querySelector(':scope > SegmentTemplate') ||
    null
  );
}

export function parseSegmentTimeline(
  segmentTemplate: Element,
  totalDuration = 0,
  timescale = 1
): number[] | undefined {
  const timeline: number[] = [];
  const timelineNode = segmentTemplate.querySelector('SegmentTimeline');
  if (!timelineNode) return undefined;

  // Max segments guard for r=-1 (unbounded repeat): derive from totalDuration or cap at 10000
  const maxSegments = totalDuration > 0 && timescale > 0
    ? Math.ceil((totalDuration * timescale) / Math.max(parseInt(timelineNode.querySelector('S')?.getAttribute('d') || '1'), 1)) + 2
    : 10_000;

  let currentTime = 0;
  for (const s of Array.from(timelineNode.querySelectorAll('S'))) {
    const t = parseInt(s.getAttribute('t') || '') || currentTime;
    const d = parseInt(s.getAttribute('d') || '');
    const rAttr = s.getAttribute('r');
    // r=-1 means "repeat until end of period" — bound it with maxSegments
    const r = rAttr === '-1'
      ? Math.ceil((totalDuration * timescale - t) / Math.max(d, 1))
      : parseInt(rAttr || '0');

    for (let i = 0; i <= r; i++) {
      timeline.push(t + i * d);
      if (timeline.length >= maxSegments) break;
    }
    currentTime = t + (r + 1) * d;
    if (timeline.length >= maxSegments) break;
  }

  return timeline.length > 0 ? timeline : undefined;
}

export function resolveBaseURL(
  representation: Element,
  adaptationSet: Element,
  mpdBase: string,
  mpdBaseURL: string
): string {
  const adaptationBaseURL =
    adaptationSet.querySelector(':scope > BaseURL')?.textContent?.trim() || mpdBaseURL;
  return new URL(adaptationBaseURL, mpdBase).href;
}

export function getRepresentationID(representation: Element): string {
  const bandwidth = representation.getAttribute('bandwidth') || '0';
  return representation.getAttribute('id') || bandwidth;
}
