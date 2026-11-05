/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { decodeFirstUri, describeContent, encodeLinkMessage, eraseNdefType2, readNdefType2, writeNdefType2 } from './type2.ts';

const LINK = 'hydratap://log?key=0123456789abcdef01234567';
const PKG = 'com.hydratap.app';

/** Minimal NTAG213 simulator: 45 pages × 4 bytes, READ / WRITE / GET_VERSION. */
function fakeNtag213(opts: { formatted?: boolean; content?: number[]; readOnly?: boolean } = {}) {
  const mem = new Array(45 * 4).fill(0);
  mem.splice(0, 9, 0x04, 0xa2, 0xb3, 0x2c, 0xc4, 0xd5, 0xe6, 0x80, 0x00);
  if (opts.formatted !== false) mem.splice(12, 4, 0xe1, 0x10, 0x12, opts.readOnly ? 0x0f : 0x00);
  const data = opts.content ?? [0x03, 0x00, 0xfe];
  if (opts.formatted !== false) mem.splice(16, data.length, ...data);
  let writes = 0;
  const tx = async (cmd: number[]): Promise<number[]> => {
    if (cmd[0] === 0x30) {
      const out: number[] = [];
      for (let i = 0; i < 16; i++) out.push(mem[(cmd[1] * 4 + i) % mem.length]);
      // Android returns Java bytes; simulate signed values to test normalisation.
      return out.map((b) => (b > 127 ? b - 256 : b));
    }
    if (cmd[0] === 0xa2) {
      if (cmd[1] < 3 || cmd[1] > 39) throw new Error('NAK');
      writes++;
      mem.splice(cmd[1] * 4, 4, ...cmd.slice(2, 6));
      return [0x0a];
    }
    if (cmd[0] === 0x60) return [0x00, 0x04, 0x04, 0x02, 0x01, 0x00, 0x0f, 0x03];
    throw new Error('unknown command');
  };
  return { tx, mem, writes: () => writes };
}

test('encode/decode link message', () => {
  const msg = encodeLinkMessage(LINK, PKG);
  assert.equal(decodeFirstUri(msg), LINK);
  assert.ok(msg.length < 137, 'fits NTAG213');
});

test('factory-formatted NTAG213: write then read back', async () => {
  const tag = fakeNtag213();
  assert.equal(await readNdefType2(tag.tx), null); // empty NDEF TLV
  assert.equal(await writeNdefType2(tag.tx, encodeLinkMessage(LINK, PKG)), 'ok');
  const msg = await readNdefType2(tag.tx);
  assert.ok(msg);
  assert.equal(decodeFirstUri(msg!), LINK);
});

test('blank (unformatted) NTAG213 gets a capability container', async () => {
  const tag = fakeNtag213({ formatted: false });
  assert.equal(await writeNdefType2(tag.tx, encodeLinkMessage(LINK, PKG)), 'ok');
  assert.deepEqual(tag.mem.slice(12, 16), [0xe1, 0x10, 0x12, 0x00]);
  assert.equal(decodeFirstUri((await readNdefType2(tag.tx))!), LINK);
});

test('overwrites an existing message (e.g. old hydratap://nfc link)', async () => {
  const tag = fakeNtag213();
  await writeNdefType2(tag.tx, encodeLinkMessage('hydratap://nfc', PKG));
  assert.equal(decodeFirstUri((await readNdefType2(tag.tx))!), 'hydratap://nfc');
  await writeNdefType2(tag.tx, encodeLinkMessage(LINK, PKG));
  assert.equal(decodeFirstUri((await readNdefType2(tag.tx))!), LINK);
});

test('skips NULL and lock-control TLVs when reading', async () => {
  const msg = encodeLinkMessage(LINK, PKG);
  const tag = fakeNtag213({ content: [0x00, 0x01, 0x03, 0xa0, 0x10, 0x44, 0x03, msg.length, ...msg, 0xfe] });
  assert.equal(decodeFirstUri((await readNdefType2(tag.tx))!), LINK);
});

test('read-only sticker is reported, nothing written', async () => {
  const tag = fakeNtag213({ readOnly: true });
  assert.equal(await writeNdefType2(tag.tx, encodeLinkMessage(LINK, PKG)), 'readOnly');
  assert.equal(tag.writes(), 0);
});

test('message larger than the sticker is rejected', async () => {
  const tag = fakeNtag213();
  assert.equal(await writeNdefType2(tag.tx, encodeLinkMessage('hydratap://log?key=' + 'x'.repeat(200), PKG)), 'tooSmall');
  assert.equal(tag.writes(), 0);
});

test('decodeFirstUri rejects non-URI records', () => {
  assert.equal(decodeFirstUri([0xd1, 0x01, 0x03, 0x54, 0x02, 0x65, 0x6e]), null); // text record
  assert.equal(decodeFirstUri([]), null);
});

test('erase restores an empty sticker', async () => {
  const tag = fakeNtag213();
  await writeNdefType2(tag.tx, encodeLinkMessage(LINK, PKG));
  assert.equal(describeContent(await readNdefType2(tag.tx)), 'hydratap');
  assert.equal(await eraseNdefType2(tag.tx), 'ok');
  assert.equal(await readNdefType2(tag.tx), null);
  assert.equal(describeContent(await readNdefType2(tag.tx)), 'blank');
});

test('describeContent', () => {
  assert.equal(describeContent(null), 'blank');
  assert.equal(describeContent([0xd0, 0x00, 0x00]), 'blank'); // empty record
  assert.equal(describeContent(encodeLinkMessage('https://example.com', PKG)), 'other');
  assert.equal(describeContent([0xd1, 0x01, 0x03, 0x54, 0x02, 0x65, 0x6e]), 'other'); // text
});
