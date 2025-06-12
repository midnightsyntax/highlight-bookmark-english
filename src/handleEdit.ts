import * as vscode from "vscode";

interface EditContext {
  range: vscode.Range;
  text: string;
}

export const handleEdit = (
  markedLines: number[] = [],
  { range, text }: EditContext
): number[] => {
  if (!markedLines.length) {
    return markedLines;
  }

  const selectionLinesCount = range.end.line - range.start.line;
  const substitutionLinesCount = text.split("\n").length - 1;

  // 如果是在同一行内的编辑
  if (selectionLinesCount === 0) {
    // 如果替换文本不包含换行，直接返回原标记
    if (substitutionLinesCount === 0) {
      return markedLines;
    }

    // 如果替换文本包含换行，更新受影响的行号
    return markedLines.map((line) =>
      line <= range.start.line ? line : line + substitutionLinesCount
    );
  }

  // 使用 Set 存储新的行号
  const resultSet = new Set<number>();

  for (const line of markedLines) {
    if (line < range.start.line) {
      // 在编辑范围之前的行保持不变
      resultSet.add(line);
    } else if (line === range.start.line && range.start.character > 0) {
      // 如果是编辑开始行且不是从行首开始，保留该行
      resultSet.add(line);
    } else if (line >= range.end.line) {
      // 在编辑范围之后的行需要调整行号
      const newLine = line - selectionLinesCount + substitutionLinesCount;
      resultSet.add(newLine);
    }
  }

  return Array.from(resultSet).sort((a, b) => a - b);
};
