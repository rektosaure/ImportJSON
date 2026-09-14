function replaceExactly(source, pattern, replacement, label, expected = 1) {
  const matches = source.match(pattern);
  if (!matches || matches.length !== expected) {
    throw new Error(`json-p3 ImportJSON patch '${label}' expected ${expected} match(es), found ${matches?.length ?? 0}`);
  }
  return source.replace(pattern, replacement);
}

/**
 * Apply the narrow json-p3@2.3.0 changes required by ImportJSON.
 *
 * This is intentionally a source patch rather than a runtime polyfill. It is
 * pinned by package-lock.json, and every replacement fails closed if the
 * upstream bundle shape changes.
 */
export function patchJsonP3(source) {
  let patched = `import { RE2JS } from "re2js";\n${source}`;

  patched = replaceExactly(
    patched,
    /const encoder = new TextEncoder\(\);\s*let codepoint = 0;\s*for \(const digit of encoder\.encode\(digits\)\) \{/g,
    `let codepoint = 0;\n    for (let i = 0; i < digits.length; i++) {\n      const digit = digits.charCodeAt(i);`,
    'remove TextEncoder from hex parsing',
  );

  patched = replaceExactly(
    patched,
    /function fullMatch\(pattern\) \{/g,
    `function mapRE2Regexp(pattern) {\n  let escaped = false;\n  let charClass = false;\n  const parts = [];\n  for (const ch of pattern) {\n    if (escaped) {\n      parts.push(ch);\n      escaped = false;\n      continue;\n    }\n    if (ch === "\\\\") {\n      escaped = true;\n      parts.push(ch);\n      continue;\n    }\n    if (ch === "[") {\n      charClass = true;\n      parts.push(ch);\n      continue;\n    }\n    if (ch === "]") {\n      charClass = false;\n      parts.push(ch);\n      continue;\n    }\n    parts.push(ch === "." && !charClass ? "[^\\\\n\\\\r]" : ch);\n  }\n  return parts.join("");\n}\n\nfunction fullMatchRE2(pattern) {\n  const parts = [];\n  const explicitCaret = pattern.startsWith("^");\n  const explicitDollar = pattern.endsWith("$");\n  if (!explicitCaret && !explicitDollar) parts.push("^(?:");\n  parts.push(mapRE2Regexp(pattern));\n  if (!explicitCaret && !explicitDollar) parts.push(")$");\n  return parts.join("");\n}\n\nfunction fullMatch(pattern) {`,
    'add RE2 I-Regexp mapping',
  );

  patched = replaceExactly(
    patched,
    /const re = new RegExp\(fullMatch\(pattern\), "u"\);/g,
    'const re = RE2JS.compile(fullMatchRE2(pattern));',
    'use RE2JS for match()',
  );

  patched = replaceExactly(
    patched,
    /const re = new RegExp\(mapRegexp\(pattern\), "u"\);/g,
    'const re = RE2JS.compile(mapRE2Regexp(pattern));',
    'use RE2JS for search()',
  );

  patched = replaceExactly(
    patched,
    /return !!s\.match\(re\);/g,
    'return re.test(s);',
    'use RE2JS search execution',
    2,
  );

  patched = replaceExactly(
    patched,
    /yield\* selector\.resolve\(node\);/g,
    `for (const selected of selector.lazyResolve(node)) {\n          if (typeof this.environment.__importJSONCheckDeadline === "function") {\n            this.environment.__importJSONCheckDeadline();\n          }\n          if ((selector instanceof SliceSelector || selector instanceof WildcardSelector) &&\n              typeof this.environment.__importJSONVisitNode === "function") {\n            this.environment.__importJSONVisitNode();\n          }\n          yield selected;\n        }`,
    'make child selector resolution lazy and count variable-work selections',
  );

  patched = replaceExactly(
    patched,
    /yield\* selector\.resolve\(_node\);/g,
    `for (const selected of selector.lazyResolve(_node)) {\n            if (typeof this.environment.__importJSONCheckDeadline === "function") {\n              this.environment.__importJSONCheckDeadline();\n            }\n            if ((selector instanceof SliceSelector || selector instanceof WildcardSelector) &&\n                typeof this.environment.__importJSONVisitNode === "function") {\n              this.environment.__importJSONVisitNode();\n            }\n            yield selected;\n          }`,
    'make descendant selector resolution lazy and count variable-work selections',
  );

  patched = replaceExactly(
    patched,
    /yield node;\s*if \(isArray\(node\.value\)\) \{/g,
    `if (typeof this.environment.__importJSONCheckDeadline === "function") {\n      this.environment.__importJSONCheckDeadline();\n    }\n    if (typeof this.environment.__importJSONVisitNode === "function") {\n      this.environment.__importJSONVisitNode();\n    }\n\n    yield node;\n\n    if (isArray(node.value)) {`,
    'check descendant traversal budgets',
  );

  patched = replaceExactly(
    patched,
    /if \(this\.expression\.evaluate\(filterContext\)\) \{/g,
    `if (typeof this.environment.__importJSONCheckDeadline === "function") {\n          this.environment.__importJSONCheckDeadline();\n        }\n        if (typeof this.environment.__importJSONVisitNode === "function") {\n          this.environment.__importJSONVisitNode();\n        }\n        if (this.expression.evaluate(filterContext)) {`,
    'check budgets for every filter candidate',
    6,
  );

  return patched;
}
