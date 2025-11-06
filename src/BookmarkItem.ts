import * as vscode from "vscode";

export class BookmarkItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly command?: vscode.Command,
    public readonly line?: number,
    public readonly filePath?: string,
    public readonly fullContent?: string,
    public readonly note?: string,
    public readonly isCurrentFile: boolean = false
  ) {
    super(label, collapsibleState);
    this.tooltip = fullContent
      ? note
        ? `${fullContent}\n\n备注: ${note}`
        : fullContent
      : filePath
        ? `${filePath}:${line}`
        : filePath;
    this.contextValue = line !== undefined ? "bookmark" : "file";

    // If it's the current file, set a special icon.
    if (isCurrentFile && this.contextValue === "file") {
      this.description = "● 当前文件";
      this.iconPath = new vscode.ThemeIcon(
        "bookmark",
        new vscode.ThemeColor("bookmarks.activeFile")
      );
    }
  }
}
