/**
 * parser.ts
 *
 * Regex/lexer-based detection of ImGui `ImVec4` literal expressions inside
 * C/C++ source text. Deliberately NOT a full C/C++ parser: it only needs to
 * find well-formed literal argument lists, not resolve identifiers, macros,
 * or expressions. This keeps the extension fast and dependency-free.
 *
 * This file has no dependency on the `vscode` module so it can be unit
 * tested with plain Node/Mocha (see test/parser.test.ts).
 */

export type NumberFormat = "float" | "int";

export interface ImVec4Component {
  /** Raw text as it appeared in source, e.g. "0.50f", "255", "1" */
  raw: string;
  /** Numeric value after stripping any trailing f/F suffix */
  value: number;
  /** Character offset of this component within the overall match, for
   *  precise in-place replacement of a single component if ever needed. */
  start: number;
  end: number;
}

export interface ImVec4Match {
  /** Offset in the full document text where the *argument list* begins,
   *  i.e. the opening bracket character. */
  start: number;
  /** Offset just past the closing bracket character. */
  end: number;
  /** '(' for constructor style, '{' for brace-init style */
  bracket: "(" | "{";
  components: [ImVec4Component, ImVec4Component, ImVec4Component, ImVec4Component];
  /** True if a trailing comma preceded the closing bracket, e.g. `{1,0,0,1,}` */
  hasTrailingComma: boolean;
  /** Detected numeric style of the *original* literal. */
  originalFormat: NumberFormat;
  /** The full matched text, "(...)" or "{...}" inclusive of brackets. */
  raw: string;
}

// Matches a single numeric literal component: optional sign, digits, optional
// decimal point + digits, optional trailing f/F float suffix.
const NUMBER = String.raw`[+-]?\d*\.?\d+[fF]?`;

// Two alternatives so the opening/closing bracket types always agree:
//   ImVec4(x, y, z, w)      -- constructor style
//   ImVec4{x, y, z, w}      -- brace-init, with or without a preceding
//                              "Type name =" (e.g. `ImVec4 col = {..};`)
// The `(?:\s+[A-Za-z_]\w*\s*=\s*)?` piece optionally absorbs a variable name
// and `=` between `ImVec4` and `{`, which is only legal before a brace-init,
// never before a constructor call.
const IMVEC4_RE = new RegExp(
  String.raw`\bImVec4\b` +
    String.raw`(?:\s+[A-Za-z_]\w*\s*=)?\s*` +
    String.raw`(?:` +
    String.raw`\((\s*)(${NUMBER})(\s*,\s*)(${NUMBER})(\s*,\s*)(${NUMBER})(\s*,\s*)(${NUMBER})(\s*,?\s*)\)` +
    String.raw`|` +
    String.raw`\{(\s*)(${NUMBER})(\s*,\s*)(${NUMBER})(\s*,\s*)(${NUMBER})(\s*,\s*)(${NUMBER})(\s*,?\s*)\}` +
    String.raw`)`,
  "g"
);

function parseComponent(raw: string, startOffsetInDoc: number): ImVec4Component {
  const numeric = raw.endsWith("f") || raw.endsWith("F") ? raw.slice(0, -1) : raw;
  return {
    raw,
    value: parseFloat(numeric),
    start: startOffsetInDoc,
    end: startOffsetInDoc + raw.length,
  };
}

/**
 * Decide whether a set of four raw component strings should be interpreted
 * as normalized floats (0.0-1.0) or 0-255 integers.
 *
 * Heuristic (documented, not perfect - this is regex-based by design):
 *  1. Any component with a decimal point or an `f`/`F` suffix  -> float.
 *  2. Otherwise all components are plain integers. If any of them is > 1,
 *     they must be 0-255 style ints (a float can't legally exceed 1.0 in
 *     normal ImGui usage) -> int.
 *  3. Otherwise every component is a bare 0 or 1 (e.g. `ImVec4(1,0,0,1)`),
 *     which is ambiguous. ImGui code overwhelmingly writes this as shorthand
 *     for float, so default to float in that case.
 */
export function detectFormat(rawComponents: string[]): NumberFormat {
  const isFloaty = rawComponents.some((r) => r.includes(".") || /f$/i.test(r));
  if (isFloaty) {
    return "float";
  }
  const anyAboveOne = rawComponents.some((r) => Math.abs(parseInt(r, 10)) > 1);
  return anyAboveOne ? "int" : "float";
}

/**
 * Find every ImVec4 literal occurrence in `text`.
 * Safe to call on arbitrarily large strings; a single global-regex pass is
 * O(n) and callers are expected to restrict `text` to a line, a visible
 * range, or a changed region rather than always re-scanning a whole file
 * (see decorations.ts for the incremental scanning strategy).
 */
export function findImVec4Matches(text: string): ImVec4Match[] {
  const results: ImVec4Match[] = [];
  IMVEC4_RE.lastIndex = 0;
  let m: RegExpExecArray | null;

  while ((m = IMVEC4_RE.exec(text)) !== null) {
    // Groups 1-9 belong to the "(" alternative, 10-18 to the "{" alternative.
    const isParen = m[2] !== undefined;
    const bracket: "(" | "{" = isParen ? "(" : "{";
    const g = isParen ? m.slice(1, 9) : m.slice(10, 18);
    const [, c1, , c2, , c3, , c4] = g; // discard whitespace groups

    const fullMatchStart = m.index;
    const bracketChar = isParen ? "(" : "{";
    const bracketIndexInMatch = m[0].indexOf(bracketChar, m[0].indexOf("ImVec4"));
    const argListStart = fullMatchStart + bracketIndexInMatch;

    // Recompute component offsets by scanning m[0] from the bracket forward.
    // This avoids fragile arithmetic across the two alternation branches.
    const argListText = m[0].slice(bracketIndexInMatch); // "(...)" or "{...}"
    const trailingCommaMatch = /,\s*[)}]\s*$/.test(argListText);

    const componentTexts = [c1, c2, c3, c4];
    const components: ImVec4Component[] = [];
    let cursor = 1; // skip opening bracket
    for (const raw of componentTexts) {
      const idx = argListText.indexOf(raw, cursor);
      const absStart = argListStart + idx;
      components.push(parseComponent(raw, absStart));
      cursor = idx + raw.length;
    }

    results.push({
      start: argListStart,
      end: argListStart + argListText.length,
      bracket,
      components: components as ImVec4Match["components"],
      hasTrailingComma: trailingCommaMatch,
      originalFormat: detectFormat(componentTexts),
      raw: argListText,
    });
  }

  return results;
}

/** Clamp helper used both when reading and when writing colors. */
export function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/**
 * Convert a match's four raw components into normalized 0.0-1.0 RGBA,
 * regardless of whether the source used float or int style.
 */
export function toRGBA(match: ImVec4Match): { r: number; g: number; b: number; a: number } {
  const [c1, c2, c3, c4] = match.components;
  const scale = match.originalFormat === "int" ? 255 : 1;
  return {
    r: clamp01(c1.value / scale),
    g: clamp01(c2.value / scale),
    b: clamp01(c3.value / scale),
    a: clamp01(c4.value / scale),
  };
}

/** Format a single numeric component back to source text in the requested style. */
export function formatComponent(value: number, format: NumberFormat): string {
  const v = clamp01(value);
  if (format === "int") {
    return String(Math.round(v * 255));
  }
  // float style: two decimal places is the common ImGui convention and
  // round-trips cleanly; trailing "f" matches typical ImGui code style.
  return `${v.toFixed(2)}f`;
}

/**
 * Rebuild the "(...)" / "{...}" text for a match given a new RGBA color and
 * a target format, preserving the original bracket style and trailing comma.
 */
export function formatArgList(
  match: ImVec4Match,
  rgba: { r: number; g: number; b: number; a: number },
  format: NumberFormat,
  includeAlpha: boolean
): string {
  const open = match.bracket;
  const close = match.bracket === "(" ? ")" : "}";
  const alpha = includeAlpha ? rgba.a : toRGBA(match).a; // leave alpha untouched if hidden
  const parts = [rgba.r, rgba.g, rgba.b, alpha].map((v) => formatComponent(v, format));
  const trailing = match.hasTrailingComma ? "," : "";
  return `${open}${parts.join(", ")}${trailing}${close}`;
}
