/**
 * Build-time shim for json-p3's only TextEncoder use.
 *
 * Apps Script V8 does not expose TextEncoder. json-p3@2.3.0 only uses it to
 * iterate ASCII hexadecimal digits while parsing \uXXXX escapes, so support
 * exactly ASCII and fail closed if the dependency starts using it differently.
 */
export class TextEncoder {
  encode(value = '') {
    const text = String(value);
    if (/[^\x00-\x7f]/.test(text)) {
      throw new TypeError('ImportJSON TextEncoder shim only supports ASCII');
    }
    return Uint8Array.from(text, (character) => character.charCodeAt(0));
  }
}
