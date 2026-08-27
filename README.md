# ImGui Color Swatch

A lightweight VS Code extension that shows an inline color swatch next to
[Dear ImGui](https://github.com/ocornut/imgui) `ImVec4` color literals in C
and C++ source, and lets you edit them in place with VS Code's native color
picker.

## Features

- Detects `ImVec4` literals in three common forms:
  - Constructor style: `ImVec4(1.0f, 0.5f, 0.0f, 1.0f)`
  - Brace-init: `ImVec4{1.0f, 0.5f, 0.0f, 1.0f}`
  - Declaration form: `ImVec4 buttonColor = { 255, 128, 0, 255 };`
- Understands both normalized float (`0.0`–`1.0`) and integer (`0`–`255`)
  component styles, with or without the trailing `f` suffix.
- Shows a small inline swatch before each match, and a native VS Code color
  swatch (the same UI you get in CSS files) that opens the standard color
  picker on click.
- Edits made in the picker are written back into the exact matched token,
  preserving:
  - the original bracket style (`(...)` vs `{...}`)
  - a trailing comma, if present
  - all surrounding whitespace, comments, and code outside the literal
  - the numeric format (float vs int), per the `imvec4Color.updateFormat`
    setting
- Alpha (`w`) is honored throughout; it can be hidden from the swatch via
  `imvec4Color.showAlpha` without affecting the stored value.
- Scanning is incremental: results are cached per document version, changes
  are debounced, and swatch *rendering* is limited to the visible range (+ a
  small buffer) so scrolling a multi-thousand-line file stays responsive.
- No C/C++ parser or AST — a small, well-tested regex/lexer handles literal
  detection only. Runtime variables and non-literal expressions are
  intentionally not resolved.

## Requirements

- VS Code `^1.85.0`
- Node.js 18+ and npm (for building from source)

## Getting started (from source)

```bash
npm install
npm run compile
```

Then press **F5** in VS Code (with this folder open) to launch an Extension
Development Host. The launch config opens the `sample/` folder automatically
so you can see swatches immediately in `sample/sample_colors.cpp`.

To package a `.vsix` for manual installation:

```bash
npm install -g @vscode/vsce   # if you don't already have vsce
npm run package
```

Then in VS Code: **Extensions view → "..." menu → Install from VSIX...**

## Running the tests

Parsing logic lives in `src/parser.ts` with zero dependency on the `vscode`
module, so it's unit tested directly with Mocha (no Extension Development
Host required):

```bash
npm test
```

This compiles the TypeScript and runs `test/parser.test.ts`, covering:
constructor style, brace-init, the `Type name = {...}` declaration form,
float vs. int detection (including the ambiguous bare-`0`/`1` case),
whitespace variance, trailing commas, multiple matches per line, multi-line
documents, non-matches (`MyImVec4Wrapper`, bare `ImVec4 color;`), component
offset accuracy, and round-trip formatting for both numeric styles.

## Settings

| Setting | Type | Default | Description |
|---|---|---|---|
| `imvec4Color.showInlineSwatch` | boolean | `true` | Show the extra inline colored square decoration before each match. |
| `imvec4Color.updateFormat` | `"preserve" \| "float" \| "int"` | `"preserve"` | Numeric style used when the color picker writes a value back. `"preserve"` keeps whatever the literal already used. |
| `imvec4Color.showAlpha` | boolean | `true` | Include alpha in the swatch/picker. When `false`, edits leave the original alpha value untouched. |
| `imvec4Color.showCheckeredTransparency` | boolean | `true` | Cosmetic flag for the checkered transparency background (VS Code's native swatch already does this for semi-transparent colors). |
| `imvec4Color.detectRanges` | string[] | `["**/*.c", "**/*.cpp", "**/*.h", "**/*.hpp"]` | Glob patterns for files to scan. |

## How detection works (design notes)

`src/parser.ts` uses one regex with two alternations — `(...)` and `{...}`
— anchored on the word-bounded token `ImVec4`, optionally preceded by a
`Type name =` fragment to catch the declaration form. It never matches
`(` and `}` (or vice versa) against each other, and `\b` word boundaries
prevent false positives like `MyImVec4Wrapper` or `NotImVec4(...)`.

**Float vs. int heuristic** (documented in code, see `detectFormat`):

1. Any component with a decimal point or `f`/`F` suffix → **float**.
2. Otherwise, if any component's magnitude is `> 1` → **int** (a valid
   normalized float can't exceed `1.0`).
3. Otherwise (all components are bare `0` or `1`) → defaults to **float**,
   since `ImVec4(1, 0, 0, 1)` is idiomatic ImGui shorthand for opaque red,
   not `rgb(1,0,0)` on a 0–255 scale.

This is a deliberate simplification, not a full type-checker — the project
brief explicitly scopes this to "robust regex/lexer-based parsing," not a
C/C++ AST.

**Two complementary rendering paths:**

- `colorProvider.ts` registers a `vscode.DocumentColorProvider`. This is
  what gives you the native, theme-matched color swatch that opens the
  standard picker on click and supports drag-editing — VS Code owns that UI
  entirely; we only supply the detected range/color and the text to write
  back on change.
- `decorations.ts` adds a second, independently toggleable inline square
  (`imvec4Color.showInlineSwatch`) using `TextEditorDecorationType`. This
  exists because some environments/themes render the native color provider
  swatch subtly, and because the brief asks for an explicit, configurable
  inline decoration in addition to picker integration. It's the piece that
  implements the incremental/visible-range scanning strategy described
  above.

## Known limitations

- Only literal `ImVec4` expressions are detected; variables, macros, and
  computed expressions are intentionally out of scope (see brief).
- The float/int heuristic can be wrong for adversarial inputs like
  `ImVec4(1, 1, 1, 1)` meant as `rgb(1,1,1)` — vanishingly rare in real ImGui
  code, and safely overridden by explicitly setting `imvec4Color.updateFormat`
  to `"float"` or `"int"`.
- Matches spanning many lines (e.g. a brace-init broken across 10+ lines
  with interleaved comments) are supported by the regex (`\s` matches
  newlines) but haven't been stress-tested beyond the multi-line case in
  `test/parser.test.ts`.

## Project layout

```
package.json          Extension manifest, contributed settings, npm scripts
tsconfig.json
src/
  extension.ts         Activation: wires up the color provider + decorations
  parser.ts             Regex-based ImVec4 detection (no vscode dependency)
  colorProvider.ts       DocumentColorProvider: native swatch + picker + edits
  decorations.ts          Inline swatch decorations, incremental scanning
  globs.ts                 Tiny glob matcher for detectRanges
test/
  parser.test.ts       Mocha unit tests for parser.ts
sample/
  sample_colors.cpp   Example ImGui usage covering every supported pattern
  imgui.h              Minimal stand-in ImVec4/ImGui declarations
```
