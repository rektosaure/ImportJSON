import { FunctionExpressionType, JSONPathEnvironment } from 'json-p3';
import { RE2JS } from 're2js';

function compareUnicodeCodePoints(left, right) {
  const leftPoints = Array.from(left, (character) => character.codePointAt(0));
  const rightPoints = Array.from(right, (character) => character.codePointAt(0));
  const length = Math.min(leftPoints.length, rightPoints.length);

  for (let index = 0; index < length; index++) {
    if (leftPoints[index] !== rightPoints[index]) {
      return leftPoints[index] - rightPoints[index];
    }
  }

  return leftPoints.length - rightPoints.length;
}

function mapRE2Regexp(pattern) {
  let escaped = false;
  let charClass = false;
  const parts = [];

  for (const character of pattern) {
    if (escaped) {
      parts.push(character);
      escaped = false;
      continue;
    }

    if (character === '\\') {
      escaped = true;
      parts.push(character);
      continue;
    }

    if (character === '[') {
      charClass = true;
      parts.push(character);
      continue;
    }

    if (character === ']') {
      charClass = false;
      parts.push(character);
      continue;
    }

    if (!charClass && (character === '^' || character === '$')) {
      parts.push(`\\${character}`);
      continue;
    }

    parts.push(character === '.' && !charClass ? '[^\\n\\r]' : character);
  }

  return parts.join('');
}

function fullMatchRE2(pattern) {
  return `^(?:${mapRE2Regexp(pattern)})$`;
}

function regexFunction({ fullMatch }) {
  return {
    argTypes: [
      FunctionExpressionType.ValueType,
      FunctionExpressionType.ValueType,
    ],
    returnType: FunctionExpressionType.LogicalType,
    call(value, pattern) {
      if (typeof value !== 'string' || typeof pattern !== 'string') return false;

      try {
        const source = fullMatch ? fullMatchRE2(pattern) : mapRE2Regexp(pattern);
        return RE2JS.compile(source).test(value);
      } catch {
        return false;
      }
    },
  };
}

export function createJSONPathEnvironment() {
  const environment = new JSONPathEnvironment();
  environment.entries = (object) => Object.entries(object)
    .sort(([left], [right]) => compareUnicodeCodePoints(left, right));
  environment.functionRegister.set('match', regexFunction({ fullMatch: true }));
  environment.functionRegister.set('search', regexFunction({ fullMatch: false }));
  return environment;
}
