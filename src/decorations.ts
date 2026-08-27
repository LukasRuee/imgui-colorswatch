import * as vscode from "vscode";
import { findImVec4Matches, toRGBA, ImVec4Match } from "./parser";
import { matchesAnyGlob } from "./globs";

/**
 * Renders a small inline colored square immediately before each detected
 * ImVec4 literal, independent of (and in addition to) the native
 * DocumentColorProvider swatch registered in colorProvider.ts. This one is
 * controlled by `imvec4Color.showInlineSwatch` and `showAlpha` /
 * `showCheckeredTransparency`, and is what makes the swatch visible even in
 * OSS/Codium builds or other editors that don't render document color
 * decorations at all offsets.
 *
 * Performance strategy (per requirements):
 *  - Matches are cached per-document, keyed by document version, so a
 *    document that hasn't changed is never re-scanned.
 *  - Re-scans are triggered by text-document change events (debounced) and
 *    by visible-range changes (scrolling), not by every keystroke in
 *    isolation - the debounce coalesces bursts of keystrokes into one scan.
 *  - Decoration *rendering* is limited to the editor's current visible
 *    ranges (+ a small buffer) even though matches for the whole document
 *    are cached, so scrolling a huge file doesn't create thousands of
 *    decoration objects at once.
 */

interface CacheEntry {
  version: number;
  matches: ImVec4Match[];
}

const DEBOUNCE_MS = 150;
const VISIBLE_RANGE_BUFFER_LINES = 100;

export class SwatchDecorationManager implements vscode.Disposable {
  private readonly cache = new Map<string /* uri */, CacheEntry>();
  private readonly decorationTypes = new Map<string /* uri+colorKey */, vscode.TextEditorDecorationType>();
  private readonly disposables: vscode.Disposable[] = [];
  private readonly debounceTimers = new Map<string, NodeJS.Timeout>();

  constructor() {
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((e) => this.scheduleRescan(e.document)),
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor) this.refresh(editor);
      }),
      vscode.window.onDidChangeTextEditorVisibleRanges((e) => this.refresh(e.textEditor)),
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration("imvec4Color")) {
          this.cache.clear();
          vscode.window.visibleTextEditors.forEach((ed) => this.refresh(ed));
        }
      }),
      vscode.workspace.onDidCloseTextDocument((doc) => this.cache.delete(doc.uri.toString()))
    );

    vscode.window.visibleTextEditors.forEach((ed) => this.refresh(ed));
  }

  private scheduleRescan(document: vscode.TextDocument) {
    const key = document.uri.toString();
    const existing = this.debounceTimers.get(key);
    if (existing) clearTimeout(existing);
    this.debounceTimers.set(
      key,
      setTimeout(() => {
        this.debounceTimers.delete(key);
        vscode.window.visibleTextEditors
          .filter((ed) => ed.document.uri.toString() === key)
          .forEach((ed) => this.refresh(ed));
      }, DEBOUNCE_MS)
    );
  }

  private isEligible(document: vscode.TextDocument): boolean {
    if (document.uri.scheme !== "file") return false;
    if (!["c", "cpp"].includes(document.languageId)) return false;
    const config = vscode.workspace.getConfiguration("imvec4Color", document.uri);
    if (!config.get<boolean>("showInlineSwatch", true)) return false;
    const globs = config.get<string[]>("detectRanges", ["**/*.c", "**/*.cpp", "**/*.h", "**/*.hpp"]);
    return matchesAnyGlob(vscode.workspace.asRelativePath(document.uri, false), globs);
  }

  private getMatches(document: vscode.TextDocument): ImVec4Match[] {
    const key = document.uri.toString();
    const cached = this.cache.get(key);
    if (cached && cached.version === document.version) {
      return cached.matches;
    }
    const matches = findImVec4Matches(document.getText());
    this.cache.set(key, { version: document.version, matches });
    return matches;
  }

  public refresh(editor: vscode.TextEditor | undefined) {
    if (!editor) return;
    const document = editor.document;

    if (!this.isEligible(document)) {
      this.clearEditorDecorations(editor);
      return;
    }

    const allMatches = this.getMatches(document);
    const visible = this.expandedVisibleRanges(editor);
    const inView = allMatches.filter((m) => {
      const pos = document.positionAt(m.start);
      return visible.some((r) => r.contains(pos));
    });

    this.render(editor, inView);
  }

  private expandedVisibleRanges(editor: vscode.TextEditor): vscode.Range[] {
    const doc = editor.document;
    return editor.visibleRanges.map((r) => {
      const startLine = Math.max(0, r.start.line - VISIBLE_RANGE_BUFFER_LINES);
      const endLine = Math.min(doc.lineCount - 1, r.end.line + VISIBLE_RANGE_BUFFER_LINES);
      return new vscode.Range(startLine, 0, endLine, doc.lineAt(endLine).text.length);
    });
  }

  private render(editor: vscode.TextEditor, matches: ImVec4Match[]) {
    const document = editor.document;
    const config = vscode.workspace.getConfiguration("imvec4Color", document.uri);
    const showAlpha = config.get<boolean>("showAlpha", true);

    // Group by rendered color so we reuse a small number of decoration types
    // per paint rather than allocating one per match.
    const buckets = new Map<string, vscode.DecorationOptions[]>();

    for (const match of matches) {
      const rgba = toRGBA(match);
      const cssColor = showAlpha
        ? `rgba(${Math.round(rgba.r * 255)}, ${Math.round(rgba.g * 255)}, ${Math.round(rgba.b * 255)}, ${rgba.a.toFixed(2)})`
        : `rgb(${Math.round(rgba.r * 255)}, ${Math.round(rgba.g * 255)}, ${Math.round(rgba.b * 255)})`;

      const startPos = document.positionAt(match.start);
      const range = new vscode.Range(startPos, startPos);
      const opts: vscode.DecorationOptions = {
        range,
        hoverMessage: `ImVec4 swatch — click the color icon (or use the Quick Fix / native color picker) to edit. RGBA(${rgba.r.toFixed(
          2
        )}, ${rgba.g.toFixed(2)}, ${rgba.b.toFixed(2)}, ${rgba.a.toFixed(2)})`,
      };

      const list = buckets.get(cssColor) ?? [];
      list.push(opts);
      buckets.set(cssColor, list);
    }

    this.clearEditorDecorations(editor);

    for (const [cssColor, opts] of buckets) {
      const key = `${editor.document.uri.toString()}::${cssColor}`;
      let decoType = this.decorationTypes.get(key);
      if (!decoType) {
        decoType = vscode.window.createTextEditorDecorationType({
          before: {
            // IMPORTANT: contentText must be non-empty. A `::before` with
            // empty content defaults to `display: inline`, which collapses
            // to zero width/height regardless of the width/height/
            // background-color values below - it silently renders nothing.
            // A single non-breaking space gives the generated box actual
            // inline content to size around.
            contentText: "\u00A0\u00A0",
            backgroundColor: cssColor,
            border: "1px solid rgba(128,128,128,0.6)",
            margin: "0 4px 0 0",
            width: "0.85em",
            height: "0.85em",
            // `textDecoration` maps directly to the CSS `text-decoration`
            // property, but VS Code passes its full string value through
            // unescaped, so appending `;display:inline-block;...` here is
            // the standard trick (used by several published color-decorator
            // extensions) to force the generated box out of the default
            // zero-size inline flow and to vertically align it with text.
            textDecoration: "none; display: inline-block; border-radius: 2px; vertical-align: middle;",
          },
        });
        this.decorationTypes.set(key, decoType);
      }
      editor.setDecorations(decoType, opts);
    }

    // Dispose decoration types from a previous render pass that are no
    // longer used by this editor's document to avoid unbounded growth.
    for (const [key, decoType] of [...this.decorationTypes.entries()]) {
      if (key.startsWith(editor.document.uri.toString() + "::") && !buckets.has(key.split("::")[1])) {
        decoType.dispose();
        this.decorationTypes.delete(key);
      }
    }
  }

  private clearEditorDecorations(editor: vscode.TextEditor) {
    const prefix = editor.document.uri.toString() + "::";
    for (const [key, decoType] of this.decorationTypes) {
      if (key.startsWith(prefix)) {
        editor.setDecorations(decoType, []);
      }
    }
  }

  dispose() {
    this.disposables.forEach((d) => d.dispose());
    this.decorationTypes.forEach((d) => d.dispose());
    this.debounceTimers.forEach((t) => clearTimeout(t));
  }
}
