import { describe, expect, it } from 'vitest';

import { checkPak, KNOWN_VERSION, PAK_NAME } from './pickPak.ts';

/**
 * A stand-in for a pak: `size` as reported, but only the footer's bytes are real.
 * slice() of the tail returns them; checkPak reads nothing else.
 */
function fakePak(name: string, size: number, footer: number[] | null): Blob & { name: string } {
  const tail = new Uint8Array(512);
  if (footer) tail.set(footer, 512 - 204); // where Palworld's footer starts: 204 bytes from the end
  return {
    name,
    size,
    type: '',
    slice: (start?: number) => {
      if (start !== size - 512) throw new Error(`read outside the footer: ${start}`);
      return new Blob([tail]);
    },
  } as unknown as Blob & { name: string };
}

const footer = (version: number) => [0xe1, 0x12, 0x6f, 0x5a, version, 0, 0, 0];
const GAME = 39_254_065_482;

describe('checkPak', () => {
  it('accepts the game file, reading only its footer', async () => {
    expect(await checkPak(fakePak(PAK_NAME, GAME, footer(KNOWN_VERSION)))).toEqual({ ok: true, size: GAME, version: 11, note: null });
  });

  it('turns away the wrong kind of file, with a reason that says what to pick', async () => {
    expect(await checkPak(fakePak('Pal-Windows.sig', GAME, null))).toEqual({ ok: false, problem: expect.stringMatching(/isn’t a \.pak file/) });
    expect(await checkPak(fakePak('BetterLamball_P.pak', 40_000_000, footer(11)))).toEqual({ ok: false, problem: expect.stringMatching(/too small.*a mod/) });
    expect(await checkPak(fakePak(PAK_NAME, 2e9, footer(11)))).toEqual({ ok: false, problem: expect.stringMatching(/still downloading/) });
    expect(await checkPak(fakePak('Backup.pak', GAME, null))).toEqual({ ok: false, problem: expect.stringMatching(/isn’t an Unreal game file/) });
  });

  it('tries an unexpected version or name, but says so', async () => {
    const newer = await checkPak(fakePak(PAK_NAME, GAME, footer(12)));
    expect(newer).toMatchObject({ ok: true, version: 12, note: expect.stringMatching(/pak version 12/) });
    const renamed = await checkPak(fakePak('Pal-Windows-backup.pak', GAME, footer(11)));
    expect(renamed).toMatchObject({ ok: true, note: expect.stringMatching(/not Pal-Windows\.pak/) });
  });

  it('explains a file that can’t be read', async () => {
    const locked = { ...fakePak(PAK_NAME, GAME, footer(11)), slice: () => ({ arrayBuffer: () => Promise.reject(new DOMException('', 'NotReadableError')) }) };
    expect(await checkPak(locked as unknown as Blob & { name: string })).toEqual({ ok: false, problem: expect.stringMatching(/couldn’t be read/) });
  });
});
