import * as vscode from "vscode";
import { bookmarksManager, onBookmarksChanged, getKey } from "./bookmarks";
import * as path from "path";
import * as fs from "fs";
import { fileExists } from "./utils";

type BookmarkValue = {
  line: number;
  decoration: vscode.TextEditorDecorationType;
};

// 获取文件指定行的内容
function getLineContent(
  filePath: string,
  line: number,
  fullContent: boolean = false
): string {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    const lines = content.split("\n");
    if (line >= 0 && line < lines.length) {
      let lineContent = lines[line].trim();
      // 如果不是获取完整内容，则截断
      if (!fullContent && lineContent.length > 50) {
        lineContent = lineContent.substring(0, 47) + "...";
      }
      return lineContent;
    }
  } catch (error) {
    console.error(`Error reading file ${filePath}:`, error);
  }
  return "";
}

export class BookmarksViewProvider
  implements vscode.TreeDataProvider<BookmarkItem>
{
  private _onDidChangeTreeData: vscode.EventEmitter<
    BookmarkItem | undefined | null
  > = new vscode.EventEmitter<BookmarkItem | undefined | null>();
  readonly onDidChangeTreeData: vscode.Event<BookmarkItem | undefined | null> =
    this._onDidChangeTreeData.event;
  private jumpToBookmarkCommand: vscode.Disposable | undefined;
  private currentFilePath: string | undefined;

  constructor(private context: vscode.ExtensionContext) {
    // 监听活动编辑器变化
    vscode.window.onDidChangeActiveTextEditor(
      (editor) => {
        this.currentFilePath = editor?.document.uri.fsPath;
        this.refresh();
      },
      null,
      context.subscriptions
    );

    // 初始化当前文件路径
    this.currentFilePath = vscode.window.activeTextEditor?.document.uri.fsPath;

    // 监听书签变化事件
    onBookmarksChanged.event(() => {
      this.refresh();
    });

    // 注册跳转到书签的命令
    this.jumpToBookmarkCommand = vscode.commands.registerCommand(
      "bookmarks.jumpToBookmark",
      async (line: number, filePath: string) => {
        try {
          // 检查文件是否存在
          if (!fileExists(filePath)) {
            vscode.window.showErrorMessage(`文件不存在: ${filePath}`);
            return;
          }

          // 检查书签是否还存在
          const bookmark = bookmarksManager.bookmarks[filePath]?.[getKey(line)];
          if (!bookmark) {
            vscode.window.showErrorMessage("书签不存在");
            return;
          }

          const document = await vscode.workspace.openTextDocument(filePath);
          const editor = await vscode.window.showTextDocument(document);
          const position = new vscode.Position(line, 0);
          editor.selection = new vscode.Selection(position, position);
          editor.revealRange(
            new vscode.Range(position, position),
            vscode.TextEditorRevealType.InCenter
          );
        } catch (error) {
          vscode.window.showErrorMessage(
            `跳转到书签失败: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
      }
    );

    // 将命令添加到订阅列表中
    this.context.subscriptions.push(this.jumpToBookmarkCommand);
  }

  dispose() {
    if (this.jumpToBookmarkCommand) {
      this.jumpToBookmarkCommand.dispose();
    }
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: BookmarkItem): vscode.TreeItem {
    // 如果是文件项且是当前活动文件，添加高亮样式
    if (
      element.contextValue === "file" &&
      element.filePath === this.currentFilePath
    ) {
      element.description = "● current file";
      // 使用不同的图标或样式来表示当前活动文件
      element.iconPath = new vscode.ThemeIcon(
        "bookmark",
        new vscode.ThemeColor("bookmarks.activeFile")
      );
    }
    return element;
  }

  async getChildren(element?: BookmarkItem): Promise<BookmarkItem[]> {
    if (element) {
      // 如果是文件项，返回该文件的所有书签
      if (element.contextValue === "file" && element.filePath) {
        const fileBookmarks = bookmarksManager.bookmarks[element.filePath];
        if (!fileBookmarks) {
          return [];
        }

        return Object.entries(fileBookmarks).map(([key, value]) => {
          const bookmarkValue = value as BookmarkValue;
          const line = bookmarkValue.line;
          const lineContent = getLineContent(element.filePath!, line);
          const fullContent = getLineContent(element.filePath!, line, true);
          const note = bookmarksManager.getBookmarkNote(
            element.filePath!,
            line
          );
          return new BookmarkItem(
            `行 ${line + 1}: ${lineContent}${note ? ` (${note})` : ""}`,
            vscode.TreeItemCollapsibleState.None,
            {
              command: "bookmarks.jumpToBookmark",
              title: "跳转到书签",
              arguments: [line, element.filePath],
            },
            line,
            element.filePath,
            fullContent,
            note
          );
        });
      }
      return [];
    }

    const allBookmarks = bookmarksManager.bookmarks;
    const items: BookmarkItem[] = [];

    // 遍历所有文件的书签
    for (const [filePath, fileBookmarks] of Object.entries(allBookmarks)) {
      // 如果文件没有书签，跳过
      if (Object.keys(fileBookmarks).length === 0) {
        continue;
      }

      // 显示相对路径
      const workspaceFolders = vscode.workspace.workspaceFolders;
      let displayPath = filePath;
      if (workspaceFolders) {
        for (const folder of workspaceFolders) {
          if (filePath.startsWith(folder.uri.fsPath)) {
            displayPath = path.relative(folder.uri.fsPath, filePath);
            break;
          }
        }
      }

      // 为每个文件创建一个分组
      const fileItem = new BookmarkItem(
        displayPath,
        vscode.TreeItemCollapsibleState.Expanded,
        undefined,
        undefined,
        filePath,
        undefined,
        undefined,
        filePath === this.currentFilePath
      );
      fileItem.contextValue = "file";
      fileItem.tooltip = filePath;
      items.push(fileItem);
    }

    return items;
  }
}

class BookmarkItem extends vscode.TreeItem {
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

    // 如果是当前文件，设置特殊图标
    if (isCurrentFile && this.contextValue === "file") {
      this.description = "● 当前文件";
      this.iconPath = new vscode.ThemeIcon(
        "bookmark",
        new vscode.ThemeColor("bookmarks.activeFile")
      );
    }
  }
}

export function registerBookmarksView(context: vscode.ExtensionContext) {
  const bookmarksViewProvider = new BookmarksViewProvider(context);

  // 使用 createTreeView 以便设置徽标（badge）
  const treeView = vscode.window.createTreeView("bookmarks-list", {
    treeDataProvider: bookmarksViewProvider,
    showCollapseAll: true,
  });
  context.subscriptions.push(treeView);

  // 计算并更新徽标：显示所有文件书签总数
  const updateBadge = () => {
    const total = Object.values(bookmarksManager.bookmarks).reduce(
      (acc, fileMap) => acc + Object.keys(fileMap).length,
      0
    );
    treeView.badge =
      total > 0
        ? { value: total, tooltip: `Total bookmarks: ${total}` }
        : undefined;
  };

  // 初始更新一次
  updateBadge();

  // 监听书签变化，刷新树和徽标
  const badgeSubscription = onBookmarksChanged.event(() => {
    updateBadge();
  });
  context.subscriptions.push(badgeSubscription);

  // 确保在清除所有书签后刷新视图
  context.subscriptions.push(
    vscode.commands.registerCommand("bookmarks.refreshView", () => {
      bookmarksViewProvider.refresh();
    })
  );

  // 注册删除书签的命令
  let deleteBookmark = vscode.commands.registerCommand(
    "bookmarks.deleteBookmark",
    async (item: BookmarkItem) => {
      if (item.line !== undefined && item.filePath) {
        // 保存当前文件路径
        const currentFilePath = bookmarksManager.filePath;

        // 如果当前文件不是要删除书签的文件，先切换到该文件
        if (currentFilePath !== item.filePath) {
          bookmarksManager.loadForFile(item.filePath, context);
        }

        // 删除书签
        bookmarksManager._clearBookmarksAtLines([item.line]);

        // 如果之前切换了文件，现在切换回原来的文件
        if (currentFilePath !== item.filePath && currentFilePath) {
          bookmarksManager.loadForFile(currentFilePath, context);
        }

        bookmarksViewProvider.refresh();
      }
    }
  );

  // 注册添加备注的命令
  let addBookmarkNote = vscode.commands.registerCommand(
    "bookmarks.addNote",
    async (item: BookmarkItem) => {
      if (item.line !== undefined && item.filePath) {
        const currentNote = bookmarksManager.getBookmarkNote(
          item.filePath,
          item.line
        );
        const note = await vscode.window.showInputBox({
          prompt: "请输入书签备注",
          placeHolder: "输入备注内容",
          value: currentNote,
        });

        if (note !== undefined) {
          if (note) {
            bookmarksManager.setBookmarkNote(item.filePath, item.line, note);
          } else {
            bookmarksManager.deleteBookmarkNote(item.filePath, item.line);
          }
          bookmarksManager._saveNotesToState(context);
          bookmarksViewProvider.refresh();
        }
      }
    }
  );

  context.subscriptions.push(deleteBookmark, addBookmarkNote);
}
