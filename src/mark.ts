import { readFileSync, writeFileSync } from 'node:fs';

/**
 * Embed an IPTC `digitalSourceType: trainedAlgorithmicMedia` XMP packet
 * directly into PNG and JPEG files — the machine-readable marking that
 * Article 50(2) requires for AI-generated media. Pure Node, no native deps.
 */

export interface MediaMarkOptions {
  model?: string;
  provider?: string;
}

export const TRAINED_ALGORITHMIC_MEDIA =
  'http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia';

export function buildXmpPacket(options: MediaMarkOptions = {}): string {
  const extra = [
    options.model ? `      <a50:model>${escapeXml(options.model)}</a50:model>` : '',
    options.provider ? `      <a50:provider>${escapeXml(options.provider)}</a50:provider>` : '',
  ]
    .filter(Boolean)
    .join('\n');
  // The xpacket "begin" attribute must contain a BOM per the XMP spec.
  return `<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="article50">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about=""
        xmlns:Iptc4xmpExt="http://iptc.org/std/Iptc4xmpExt/2008-02-29/"
        xmlns:a50="https://github.com/satwikbasu/article50/ns/1.0/"
        Iptc4xmpExt:DigitalSourceType="${TRAINED_ALGORITHMIC_MEDIA}">
${extra}
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
}

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => `&#${c.charCodeAt(0)};`);
}

// ---------------------------------------------------------------- PNG ----

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buf) c = (CRC_TABLE[(c ^ byte) & 0xff] as number) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([length, typeAndData, crc]);
}

/** iTXt chunk carrying the XMP packet under the standard XMP keyword. */
function xmpItxtChunk(xmp: string): Buffer {
  const data = Buffer.concat([
    Buffer.from('XML:com.adobe.xmp', 'latin1'),
    Buffer.from([0, 0, 0]), // null + compression flag 0 + compression method 0
    Buffer.from([0]), // empty language tag
    Buffer.from([0]), // empty translated keyword
    Buffer.from(xmp, 'utf8'),
  ]);
  return pngChunk('iTXt', data);
}

export function markPng(png: Buffer, options: MediaMarkOptions = {}): Buffer {
  if (!png.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error('Not a PNG file (bad signature)');
  }
  // Insert after IHDR, the mandatory first chunk: 8 (signature) + 4 + 4 + IHDR length + 4 (crc)
  const ihdrLength = png.readUInt32BE(8);
  const insertAt = 8 + 4 + 4 + ihdrLength + 4;
  return Buffer.concat([
    png.subarray(0, insertAt),
    xmpItxtChunk(buildXmpPacket(options)),
    png.subarray(insertAt),
  ]);
}

// --------------------------------------------------------------- JPEG ----

const XMP_NAMESPACE_HEADER = 'http://ns.adobe.com/xap/1.0/\0';

export function markJpeg(jpeg: Buffer, options: MediaMarkOptions = {}): Buffer {
  if (jpeg.length < 2 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8) {
    throw new Error('Not a JPEG file (bad SOI marker)');
  }
  const payload = Buffer.concat([
    Buffer.from(XMP_NAMESPACE_HEADER, 'latin1'),
    Buffer.from(buildXmpPacket(options), 'utf8'),
  ]);
  if (payload.length + 2 > 0xffff) {
    throw new Error('XMP payload too large for a single APP1 segment');
  }
  const segment = Buffer.alloc(4);
  segment[0] = 0xff;
  segment[1] = 0xe1; // APP1
  segment.writeUInt16BE(payload.length + 2, 2);
  // Insert right after SOI; preceding APP0/JFIF is conventional but not required.
  return Buffer.concat([jpeg.subarray(0, 2), segment, payload, jpeg.subarray(2)]);
}

// ------------------------------------------------------------- shared ----

export type MediaType = 'png' | 'jpeg';

export function sniffMediaType(buf: Buffer): MediaType | undefined {
  if (buf.subarray(0, 8).equals(PNG_SIGNATURE)) return 'png';
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xd8) return 'jpeg';
  return undefined;
}

export function markMedia(buf: Buffer, options: MediaMarkOptions = {}): Buffer {
  const type = sniffMediaType(buf);
  if (type === 'png') return markPng(buf, options);
  if (type === 'jpeg') return markJpeg(buf, options);
  throw new Error('Unsupported media type — only PNG and JPEG are supported in v0.2');
}

/** True when the buffer already carries a trainedAlgorithmicMedia marker. */
export function isMarked(buf: Buffer): boolean {
  return buf.includes('trainedAlgorithmicMedia');
}

export interface MarkFileResult {
  file: string;
  alreadyMarked: boolean;
  written: boolean;
}

export function markFile(path: string, options: MediaMarkOptions = {}, outPath?: string): MarkFileResult {
  const buf = readFileSync(path);
  if (isMarked(buf)) {
    return { file: path, alreadyMarked: true, written: false };
  }
  const marked = markMedia(buf, options);
  writeFileSync(outPath ?? path, marked);
  return { file: outPath ?? path, alreadyMarked: false, written: true };
}

export function checkFile(path: string): boolean {
  return isMarked(readFileSync(path));
}
