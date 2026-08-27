import * as vscode from "vscode";
import { findImVec4Matches, toRGBA, formatArgList, NumberFormat, ImVec4Match } from "./parser";
import { matchesAnyGlob } from "./globs";

/**
 * Implements vscode.DocumentColorProvider so that:
 *  - VS Code renders its native, theme-aware color swatch at each match
 *    (this is the same UI CSS files get for `color: #fff`), satisfying the
 *    "click the swatch to open the standard color picker" requirement with
 *    zero custom UI code.
 *  - When the user edits the color in that picker, provideColorPresentations
 *    is called with the new color and we return replacement text that:
 *      * preserves the original bracket style ( vs { )
 *      * preserves a trailing comma if one was present
 *      * writes numbers in the format chosen by `imvec4Color.updateFormat`
 *        ("preserve" reuses whatever the literal originally used)
 *      * leaves alpha untouched if `imvec4Color.showAlpha` is false
 *
 * Because provideColorPresentations only receives the Color and the Range
 * that was reported (not our internal match object), we re-run the parser
 * on just that range's text to recover bracket style / trailing comma, so
 * a fresh document edit elsewhere doesn't invalidate a stale closure.
 */
export class ImVec4ColorProvider implements vscode.DocumentColorProvider {
  public isEligible(document: vscode.TextDocument): boolean {
    if (document.uri.scheme !== "file") return false;
    const config = vscode.workspace.getConfiguration("imvec4Color", document.uri);
    const globs = config.get<string[]>("detectRanges", ["**/*.c", "**/*.cpp", "**/*.h", "**/*.hpp"]);
    return matchesAnyGlob(vscode.workspace.asRelativePath(document.uri, false), globs);
  }

  provideDocumentColors(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.ColorInformation[]> {
    if (!this.isEligible(document)) return [];

    const matches = findImVec4Matches(document.getText());
    return matches.map((m) => {
      const rgba = toRGBA(m);
      const range = new vscode.Range(document.positionAt(m.start), document.positionAt(m.end));
      return new vscode.ColorInformation(range, new vscode.Color(rgba.r, rgba.g, rgba.b, rgba.a));
    });
  }

  provideColorPresentations(
    color: vscode.Color,
    context: { document: vscode.TextDocument; range: vscode.Range },
    _token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.ColorPresentation[]> {
    const { document, range } = context;
    const originalText = document.getText(range);

    // Re-parse just this range (wrapped so the shared regex still matches)
    // to recover bracket style / trailing comma / original numeric format.
    const reparsed = findImVec4Matches(`ImVec4${originalText}`)[0] as ImVec4Match | undefined;
    if (!reparsed) {
      // Extremely defensive fallback: shouldn't happen since this range was
      // produced by the same parser in provideDocumentColors.
      return [];
    }

    const config = vscode.workspace.getConfiguration("imvec4Color", document.uri);
    const configuredFormat = config.get<NumberFormat | "preserve">("updateFormat", "preserve");
    const showAlpha = config.get<boolean>("showAlpha", true);
    const format: NumberFormat = configuredFormat === "preserve" ? reparsed.originalFormat : configuredFormat;

    const newText = formatArgList(
      reparsed,
      { r: color.red, g: color.green, b: color.blue, a: color.alpha },
      format,
      showAlpha
    );

    const presentation = new vscode.ColorPresentation(newText);
    presentation.textEdit = new vscode.TextEdit(range, newText);
    return [presentation];
  }
}
