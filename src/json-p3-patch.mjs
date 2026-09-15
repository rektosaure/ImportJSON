function replaceExactly(source, pattern, replacement, label) {
  const matches = source.match(pattern);
  if (!matches || matches.length !== 1) {
    throw new Error(`json-p3 ImportJSON patch '${label}' expected 1 match, found ${matches?.length ?? 0}`);
  }
  return source.replace(pattern, replacement);
}

/**
 * Apply the only json-p3@2.3.0 source adaptation required by Apps Script V8.
 *
 * json-p3 uses TextEncoder while parsing hexadecimal escapes. Apps Script V8
 * does not expose TextEncoder, and those digits are ASCII, so the build replaces
 * that one encoding loop with direct character-code iteration.
 */
export function patchJsonP3(source) {
  return replaceExactly(
    source,
    /const encoder = new TextEncoder\(\);\s*let codepoint = 0;\s*for \(const digit of encoder\.encode\(digits\)\) \{/g,
    `let codepoint = 0;\n    for (let i = 0; i < digits.length; i++) {\n      const digit = digits.charCodeAt(i);`,
    'remove TextEncoder from hex parsing',
  );
}
