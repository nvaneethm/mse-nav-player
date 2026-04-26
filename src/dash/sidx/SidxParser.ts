/**
 * Parses an ISO 14496-12 Segment Index Box (sidx) to extract per-segment byte ranges.
 *
 * The sidx box immediately precedes the media data. Each reference entry describes
 * one segment's byte length. Combined with the byte offset of the end of the sidx
 * box (derived from indexRange in the MPD), we can compute the absolute byte range
 * for every segment in the file.
 *
 * @param buffer  - ArrayBuffer containing the raw sidx box bytes.
 * @param indexRange - The "start-end" byte range string from the MPD (e.g. "837-3532").
 * @returns Array of "start-end" byte range strings, one per segment.
 */
export function parseSidx(buffer: ArrayBuffer, indexRange: string): string[] {
  const view = new DataView(buffer);
  let offset = 0;

  // Walk boxes to find 'sidx'
  while (offset < buffer.byteLength - 8) {
    const boxSize = view.getUint32(offset, false);
    const boxType =
      String.fromCharCode(
        view.getUint8(offset + 4),
        view.getUint8(offset + 5),
        view.getUint8(offset + 6),
        view.getUint8(offset + 7),
      );

    if (boxType === 'sidx') {
      return parseSidxBox(view, offset, indexRange);
    }

    if (boxSize === 0 || boxSize > buffer.byteLength - offset) break;
    offset += boxSize;
  }

  return [];
}

function parseSidxBox(view: DataView, boxStart: number, indexRange: string): string[] {
  // indexRange end tells us where in the file the sidx box ends (exclusive start of media)
  const indexEnd = parseInt(indexRange.split('-')[1], 10);

  let pos = boxStart + 8; // skip size + type

  const version = view.getUint8(pos);
  pos += 4; // version + flags

  pos += 4; // reference_id
  pos += 4; // timescale

  let firstOffset: number;
  if (version === 0) {
    pos += 4; // earliest_presentation_time (32-bit)
    firstOffset = view.getUint32(pos, false);
    pos += 4;
  } else {
    // version 1: 64-bit fields — we only handle the low 32 bits safely
    pos += 8; // earliest_presentation_time
    firstOffset = view.getUint32(pos + 4, false); // low 32 bits of first_offset
    pos += 8;
  }

  pos += 2; // reserved
  const referenceCount = view.getUint16(pos, false);
  pos += 2;

  // Byte offset in the file where the first segment starts
  let byteStart = indexEnd + 1 + firstOffset;
  const ranges: string[] = [];

  for (let i = 0; i < referenceCount; i++) {
    const word0 = view.getUint32(pos, false);
    pos += 4;
    pos += 4; // subsegment_duration
    pos += 4; // SAP info

    const referenceType = (word0 >>> 31) & 0x1;
    if (referenceType !== 0) {
      // Type 1 = reference to another sidx (hierarchical) — skip
      continue;
    }

    const referencedSize = word0 & 0x7fffffff;
    const byteEnd = byteStart + referencedSize - 1;
    ranges.push(`${byteStart}-${byteEnd}`);
    byteStart += referencedSize;
  }

  return ranges;
}
