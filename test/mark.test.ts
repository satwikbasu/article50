import { describe, expect, it } from 'vitest';
import {
  buildXmpPacket,
  isMarked,
  markJpeg,
  markMedia,
  markPng,
  sniffMediaType,
  TRAINED_ALGORITHMIC_MEDIA,
} from '../src/mark.js';

// 1x1 transparent PNG and 1x1 white JPEG, the smallest valid files of each type.
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);
const TINY_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==',
  'base64',
);

describe('mark', () => {
  it('builds an XMP packet with the IPTC trained-algorithmic-media source type', () => {
    const xmp = buildXmpPacket({ model: 'gpt-image-1', provider: 'openai' });
    expect(xmp).toContain(TRAINED_ALGORITHMIC_MEDIA);
    expect(xmp).toContain('<a50:model>gpt-image-1</a50:model>');
    expect(xmp).toContain('xpacket');
  });

  it('escapes XML in embedded metadata', () => {
    expect(buildXmpPacket({ model: 'x<&>"' })).not.toContain('x<&>"');
  });

  it('marks a PNG, preserving signature and IHDR position', () => {
    const marked = markPng(TINY_PNG);
    expect(isMarked(marked)).toBe(true);
    expect(isMarked(TINY_PNG)).toBe(false);
    // signature intact
    expect(marked.subarray(0, 8).equals(TINY_PNG.subarray(0, 8))).toBe(true);
    // IHDR still the first chunk
    expect(marked.subarray(12, 16).toString('latin1')).toBe('IHDR');
    // iTXt follows IHDR (IHDR data is 13 bytes: 8+4+4+13+4 = 33, chunk type at 33+4)
    expect(marked.subarray(37, 41).toString('latin1')).toBe('iTXt');
    // file still ends with IEND
    expect(marked.subarray(marked.length - 8, marked.length - 4).toString('latin1')).toBe('IEND');
  });

  it('marks a JPEG with an APP1 XMP segment right after SOI', () => {
    const marked = markJpeg(TINY_JPEG);
    expect(isMarked(marked)).toBe(true);
    expect(marked[0]).toBe(0xff);
    expect(marked[1]).toBe(0xd8);
    expect(marked[2]).toBe(0xff);
    expect(marked[3]).toBe(0xe1); // APP1
    const segLength = marked.readUInt16BE(4);
    expect(marked.subarray(6, 6 + 28).toString('latin1')).toBe('http://ns.adobe.com/xap/1.0/');
    // declared length covers namespace header + packet
    expect(segLength).toBeGreaterThan(28);
    // original stream resumes after the inserted segment
    expect(marked.subarray(4 + segLength).equals(TINY_JPEG.subarray(2))).toBe(true);
  });

  it('sniffs media types and rejects unsupported ones', () => {
    expect(sniffMediaType(TINY_PNG)).toBe('png');
    expect(sniffMediaType(TINY_JPEG)).toBe('jpeg');
    expect(sniffMediaType(Buffer.from('GIF89a'))).toBeUndefined();
    expect(() => markMedia(Buffer.from('GIF89a'))).toThrow(/Unsupported/);
  });

  it('rejects corrupt inputs', () => {
    expect(() => markPng(Buffer.from('nope'))).toThrow(/Not a PNG/);
    expect(() => markJpeg(Buffer.from('nope'))).toThrow(/Not a JPEG/);
  });
});
