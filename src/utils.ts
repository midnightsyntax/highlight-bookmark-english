import * as fs from "fs";
import * as vscode from "vscode";
import { logger } from "./logger";
import { storeKey } from "./bookmarks";

const LINE_END = 999;
const DEFAULT_LINECOLOR = vscode.workspace.getConfiguration().inspect<string>('lineBookmarks.lineColor')?.defaultValue
const DEFAULT_LINEWIDTH = vscode.workspace.getConfiguration().inspect<number>('lineBookmarks.lineWidth')?.defaultValue
const DEFAULT_LINESTYLE = vscode.workspace.getConfiguration().inspect<string>('lineBookmarks.lineStyle')?.defaultValue

const getConfig = <T>(key: string, defaultValue: T): T =>
  vscode.workspace
    .getConfiguration(storeKey)
    .get(key, defaultValue);

export const isDebug = () => getConfig<boolean>("debug", false);

export const fileExists = (path: string) => fs.existsSync(path);

export const moveCursorToLine = (line: number, column: number = LINE_END) => {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }

  const alignTopOnNavigation = getConfig<boolean>(
    "alignTopOnNavigation",
    false
  );
  const reviewType = alignTopOnNavigation
    ? vscode.TextEditorRevealType.AtTop
    : vscode.TextEditorRevealType.InCenterIfOutsideViewport;

  const newSelection = new vscode.Selection(line, column, line, column);
  editor.selection = newSelection;
  editor.revealRange(newSelection, reviewType);
};

export const line2range = (line: number) => {
  const start = new vscode.Position(line, 0);
  const end = new vscode.Position(line, LINE_END);
  return new vscode.Range(start, end);
};

export const range2line = (range: vscode.Range): number => range.start.line;

export const getNextLine = (lines: number[], currentLine: number): number => {
  if (!lines.length) {
    return currentLine;
  }

  logger.info(`getNextLine: ${JSON.stringify(lines)} ${currentLine}`);

  if (currentLine < lines[0]) {
    return lines[0];
  } else if (currentLine >= lines[lines.length - 1]) {
    return lines[0];
  }

  // 找到第一个大于当前行的书签行
  const nextLine = lines.find((line) => line > currentLine);
  return nextLine !== undefined ? nextLine : lines[0];
};

export const getPrevLine = (lines: number[], currentLine: number): number => {
  if (!lines.length) {
    return currentLine;
  }

  logger.info(`getPrevLine: ${JSON.stringify(lines)} ${currentLine}`);

  if (currentLine > lines[lines.length - 1]) {
    return lines[lines.length - 1];
  } else if (currentLine <= lines[0]) {
    return lines[lines.length - 1];
  }

  // 找到最后一个小于当前行的书签行
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i] < currentLine) {
      return lines[i];
    }
  }

  return lines[lines.length - 1];
};

export const createDecoration = (
  context: vscode.ExtensionContext
): vscode.TextEditorDecorationType => {
  let renderLine = vscode.workspace
    .getConfiguration(storeKey)
    .get("renderLine", true);
  const renderGutter = vscode.workspace
    .getConfiguration(storeKey)
    .get("renderGutter");
  if (renderLine) {
    const lineColor = vscode.workspace
      .getConfiguration('lineBookmarks')
      .get('lineColor', DEFAULT_LINECOLOR);
    const lineWidth = vscode.workspace
      .getConfiguration(storeKey)
      .get("lineWidth", `${DEFAULT_LINEWIDTH}px`);
    const lineStyle = vscode.workspace
      .getConfiguration(storeKey)
      .get("lineStyle", DEFAULT_LINESTYLE);

    const decorationOptions: vscode.DecorationRenderOptions = {
      gutterIconPath: renderGutter ? context.asAbsolutePath("images/icon.svg") : undefined,
      dark: {
        gutterIconPath: renderGutter ? context.asAbsolutePath("images/icon.svg") : undefined
      },
      isWholeLine: true,
      borderWidth: `0 0 ${lineWidth} 0`,
      borderStyle: lineStyle,
      borderColor: lineColor,
    };

    return vscode.window.createTextEditorDecorationType(decorationOptions);
  } else {
    if (renderGutter) {
      const decorationOptions: vscode.DecorationRenderOptions = {
        gutterIconPath: context.asAbsolutePath("images/icon.svg"),
        dark: {
          gutterIconPath: context.asAbsolutePath("images/icon.svg"),
        },
      };
      return vscode.window.createTextEditorDecorationType(decorationOptions);
    }
  }
  return vscode.window.createTextEditorDecorationType({});
};

export const createLinesRange = (start: number, endInclusive: number) => {
  return Array.from({ length: endInclusive - start + 1 }, (_, i) => start + i);
};
