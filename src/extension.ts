import * as vscode from "vscode";
import { ImVec4ColorProvider } from "./colorProvider";
import { SwatchDecorationManager } from "./decorations";

export function activate(context: vscode.ExtensionContext) {
  const selector: vscode.DocumentSelector = [
    { language: "c", scheme: "file" },
    { language: "cpp", scheme: "file" },
  ];

  const colorProvider = new ImVec4ColorProvider();
  context.subscriptions.push(vscode.languages.registerColorProvider(selector, colorProvider));

  const decorationManager = new SwatchDecorationManager();
  context.subscriptions.push(decorationManager);
}

export function deactivate() {
  // All state is owned by disposables registered in context.subscriptions.
}
