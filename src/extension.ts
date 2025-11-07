import * as vscode from "vscode";
import { bookmarksManager, onBookmarksChanged } from "./bookmarks";
import { registerBookmarksView } from "./bookmarksView";

const EXTENSION_PACKAGENAME = 'bookmarkLines';

// Save a reference to the context
let extensionContext: vscode.ExtensionContext;

// status bar buttons
let prevBookmarkStatusBarItem: vscode.StatusBarItem;
let nextBookmarkStatusBarItem: vscode.StatusBarItem;

export function activate(context: vscode.ExtensionContext) {
  // Save context reference
  extensionContext = context;

  bookmarksManager.init(context);
  registerBookmarksView(context);

  // Create status bar buttons
  prevBookmarkStatusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    10
  );
  prevBookmarkStatusBarItem.text = "$(arrow-up) Prev Bookmark";
  prevBookmarkStatusBarItem.command =
    `${EXTENSION_PACKAGENAME}.navigateToPrevBookmark`;
  prevBookmarkStatusBarItem.tooltip =
    "Navigate to Previous Bookmark (Shift+F2)";
  context.subscriptions.push(prevBookmarkStatusBarItem);

  nextBookmarkStatusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    10
  );
  nextBookmarkStatusBarItem.text = "$(arrow-down) Next Bookmark";
  nextBookmarkStatusBarItem.command =
    `${EXTENSION_PACKAGENAME}.navigateToNextBookmark`;
  nextBookmarkStatusBarItem.tooltip = "Navigate to Next Bookmark (F2)";
  context.subscriptions.push(nextBookmarkStatusBarItem);

  // 初始更新状态栏按钮可见性
  updateStatusBarItems();

  // 注册所有书签相关的命令
  let toggleBookmarks = vscode.commands.registerCommand(
    `${EXTENSION_PACKAGENAME}.toggleBookmarks`,
    () => {
      bookmarksManager.toggleBookmarks(context);
    }
  );

  let clearAllBookmarks = vscode.commands.registerCommand(
    `${EXTENSION_PACKAGENAME}.clearAllBookmarks`,
    async () => {
      // 显示确认对话框
      const answer = await vscode.window.showWarningMessage(
        "Are you sure to delete all bookmarks?",
        "Yes",
        "No"
      );

      // 如果用户点击了"确定"，则删除所有书签
      if (answer === "Yes") {
        bookmarksManager.clearAllBookmarks(context);
        // 刷新书签视图
        `scode.commands.executeCommand("${EXTENSION_PACKAGENAME}.refreshView"`;
      }
    }
  );

  let navigateToNextBookmark = vscode.commands.registerCommand(
    `${EXTENSION_PACKAGENAME}.navigateToNextBookmark`,
    () => {
      bookmarksManager.navigateToNext();
    }
  );

  let navigateToPrevBookmark = vscode.commands.registerCommand(
    `${EXTENSION_PACKAGENAME}.navigateToPrevBookmark`,
    () => {
      bookmarksManager.navigateToPrev();
    }
  );

  let clearCurrentFileBookmarks = vscode.commands.registerCommand(
    `${EXTENSION_PACKAGENAME}clearCurrentFileBookmarks`,
    async () => {
      // 显示确认对话框
      const answer = await vscode.window.showWarningMessage(
        "Are you sure to delete all bookmarks in current file?",
        "Yes",
        "No"
      );

      // 如果用户点击了"确定"，则删除当前文件的所有书签
      if (answer === "Yes") {
        bookmarksManager.clearCurrentFileBookmarks(context);
        // 刷新书签视图
        `vscode.commands.executeCommand("${EXTENSION_PACKAGENAME}.refreshView"`;
      }
    }
  );

  // Listen for changes in the activity editor and add commands to the subscription list.
  context.subscriptions.push(
    toggleBookmarks,
    clearAllBookmarks,
    navigateToNextBookmark,
    navigateToPrevBookmark,
    clearCurrentFileBookmarks
  );

  // Load bookmarks after active file changes.
  vscode.window.onDidChangeActiveTextEditor(
    (editor) => {
      bookmarksManager.loadForFile(editor?.document.uri.fsPath, context);
    },
    null,
    context.subscriptions
  );

  // The only way for now to keep bookmarks positions in sync with what is shown in VS Code.
  // @see https://github.com/microsoft/vscode/issues/54147
  vscode.workspace.onDidChangeTextDocument((event) => {
    // Only handle changes in files on disk
    if (!event.document.isUntitled && event.document.uri.scheme === "file") {
      bookmarksManager.handleTextChanges(context, event.contentChanges);
    }
  });

  // Listen for bookmark change events
  context.subscriptions.push(
    onBookmarksChanged.event(() => {
      updateStatusBarItems();
    })
  );

  // Listen for editor change events
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(() => {
      updateStatusBarItems();
    })
  );
}

// Export the function to get the context
export function getExtensionContext() {
  return extensionContext;
}

/**
* Update the visibility of status bar buttons
* Show buttons when the current file has bookmarks, otherwise hide them
 */
function updateStatusBarItems() {
  const editor = vscode.window.activeTextEditor;

  if (editor) {
    const currentFilePath = editor.document.uri.fsPath;
    const bookmarks = bookmarksManager._getLines();

    if (bookmarks && bookmarks.length > 0) {
      prevBookmarkStatusBarItem.show();
      nextBookmarkStatusBarItem.show();
    } else {
      prevBookmarkStatusBarItem.hide();
      nextBookmarkStatusBarItem.hide();
    }
  } else {
    prevBookmarkStatusBarItem.hide();
    nextBookmarkStatusBarItem.hide();
  }
}

export function deactivate() {
  // 清理状态栏按钮
  if (prevBookmarkStatusBarItem) {
    prevBookmarkStatusBarItem.dispose();
  }
  if (nextBookmarkStatusBarItem) {
    nextBookmarkStatusBarItem.dispose();
  }
}
