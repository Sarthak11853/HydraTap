/**
 * Reads and writes the HydraTap link on NFC Forum Type 2 stickers (NTAG213/215/216,
 * MIFARE Ultralight) with raw NFC-A commands. This works while Android reader mode
 * skips its NDEF check, the mode that reliably discovers taps. Pure logic: the
 * caller passes a `transceive` function, so it is unit-tested without hardware.
 */

export type Transceive = (bytes: number[]) => Promise<number[]>;

const READ = 0x30; // returns 16 bytes = 4 pages starting at the given page
const WRITE = 0xa2; // writes one 4-byte page
const GET_VERSION = 0x60;
const FIRST_DATA_PAGE = 4;

/** NTAG GET_VERSION storage-size byte → capability-container data size (×8 bytes). */
const CC_SIZE_BY_STORAGE: Record<number, number> = { 0x0f: 0x12, 0x11: 0x3e, 0x13: 0x6d };

export type WriteOutcome = 'ok' | 'readOnly' | 'tooSmall' | 'unsupported';

const u8 = (bytes: number[]) => bytes.map((b) => b & 0xff);
const ascii = (s: string) => Array.from(s, (c) => c.charCodeAt(0) & 0xff);

/* ---------------- NDEF message (URI + Android Application Record) ---------------- */

function shortRecord(header: number, type: number[], payload: number[]): number[] {
  return [header, type.length, payload.length, ...type, ...payload];
}

/** NDEF message: URI record (no prefix abbreviation) + AAR `pkg`. */
export function encodeLinkMessage(link: string, pkg: string): number[] {
  const uriPayload = [0x00, ...ascii(link)];
  // MB | SR | TNF=1 (well-known), type "U"
  const uri = shortRecord(0x91, [0x55], uriPayload);
  // ME | SR | TNF=4 (external), type "android.com:pkg"
  const aar = shortRecord(0x54, ascii('android.com:pkg'), ascii(pkg));
  return [...uri, ...aar];
}

/** The first record's URI if it is an unabbreviated URI record, else null. */
export function decodeFirstUri(message: number[]): string | null {
  const m = u8(message);
  if (m.length < 3) return null;
  const header = m[0];
  const tnf = header & 0x07;
  const shortRec = (header & 0x10) !== 0;
  const hasId = (header & 0x08) !== 0;
  const typeLen = m[1];
  let i = 2;
  let payloadLen: number;
  if (shortRec) {
    payloadLen = m[i];
    i += 1;
  } else {
    payloadLen = ((m[i] << 24) | (m[i + 1] << 16) | (m[i + 2] << 8) | m[i + 3]) >>> 0;
    i += 4;
  }
  const idLen = hasId ? m[i++] : 0;
  const type = m.slice(i, i + typeLen);
  i += typeLen + idLen;
  const payload = m.slice(i, i + payloadLen);
  if (tnf !== 1 || type.length !== 1 || type[0] !== 0x55 || payload.length < 1 || payload[0] !== 0x00) return null;
  return String.fromCharCode(...payload.slice(1));
}

/* ---------------- Type 2 tag memory ---------------- */

async function readPages(tx: Transceive, page: number): Promise<number[]> {
  const res = u8(await tx([READ, page]));
  if (res.length < 16) throw new Error('short read');
  return res.slice(0, 16);
}

async function writePage(tx: Transceive, page: number, data: number[]): Promise<void> {
  await tx([WRITE, page, ...data]);
}

/** Returns the NDEF message bytes stored on the tag, or null if there is none. */
export async function readNdefType2(tx: Transceive): Promise<number[] | null> {
  const cc = (await readPages(tx, 3)).slice(0, 4);
  if (cc[0] !== 0xe1) return null;
  const dataSize = cc[2] * 8;
  const buf: number[] = [];
  let nextPage = FIRST_DATA_PAGE;
  const ensure = async (n: number) => {
    while (buf.length < n && buf.length < dataSize) {
      buf.push(...(await readPages(tx, nextPage)));
      nextPage += 4;
    }
    if (buf.length < n) throw new Error('TLV beyond data area');
  };

  let i = 0;
  while (i < dataSize) {
    await ensure(i + 1);
    const t = buf[i];
    if (t === 0x00) {
      i += 1; // NULL TLV
      continue;
    }
    if (t === 0xfe) return null; // terminator before any NDEF TLV
    await ensure(i + 2);
    let len = buf[i + 1];
    let hdr = 2;
    if (len === 0xff) {
      await ensure(i + 4);
      len = (buf[i + 2] << 8) | buf[i + 3];
      hdr = 4;
    }
    if (t === 0x03) {
      if (len === 0) return null;
      await ensure(i + hdr + len);
      return buf.slice(i + hdr, i + hdr + len);
    }
    i += hdr + len; // lock / memory-control / proprietary TLV
  }
  return null;
}

/** Writes `message` as the tag's NDEF message (formatting a blank NTAG if needed). */
export async function writeNdefType2(tx: Transceive, message: number[]): Promise<WriteOutcome> {
  let cc = (await readPages(tx, 3)).slice(0, 4);
  if (cc[0] !== 0xe1) {
    if (cc.some((b) => b !== 0)) return 'unsupported';
    // Blank NTAG: write the capability container (one-time programmable).
    const version = u8(await tx([GET_VERSION]));
    const size = CC_SIZE_BY_STORAGE[version[6]];
    if (!size) return 'unsupported';
    cc = [0xe1, 0x10, size, 0x00];
    await writePage(tx, 3, cc);
  }
  if ((cc[3] & 0x0f) !== 0) return 'readOnly'; // low nibble = write access

  const len = message.length;
  const tlv = len < 0xff ? [0x03, len, ...message, 0xfe] : [0x03, 0xff, len >> 8, len & 0xff, ...message, 0xfe];
  if (tlv.length > cc[2] * 8) return 'tooSmall';
  while (tlv.length % 4 !== 0) tlv.push(0x00);
  for (let i = 0; i < tlv.length; i += 4) {
    await writePage(tx, FIRST_DATA_PAGE + i / 4, tlv.slice(i, i + 4));
  }
  return 'ok';
}
