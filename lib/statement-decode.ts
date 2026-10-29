// Kept apart from statement-intake so the browser screens can import it without Node-only modules.
// Bank exports are not always UTF-8: Baltic banks have offered Windows-1257 files, and Excel saves UTF-16.
// Decides from the bytes. The result is always a string the parser can read; a note says what was assumed.
export function decodeStatementBytes(bytes: Uint8Array): { text: string; encoding: string } {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return { text: new TextDecoder('utf-16le').decode(bytes.subarray(2)), encoding: 'UTF-16LE' };
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return { text: new TextDecoder('utf-16be').decode(bytes.subarray(2)), encoding: 'UTF-16BE' };
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), encoding: 'UTF-8' };
  } catch {
    return { text: new TextDecoder('windows-1257').decode(bytes), encoding: 'WINDOWS-1257 (assumed: the file is not valid UTF-8)' };
  }
}
