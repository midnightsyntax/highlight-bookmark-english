import * as vscode from "vscode";
import { logger } from "./logger";
import {
  isDebug,
  fileExists,
  getNextLine,
  getPrevLine,
  moveCursorToLine,
  line2range,
  createDecoration,
  createLinesRange,
} from "./utils";
import { handleEdit } from "./handleEdit";
import { getExtensionContext } from "./extension";

const storeKey = "lineHighlightBookmark";
const notesStoreKey = "lineHighlightBookmarkNotes";

type BookmarkData = {
  line: number;
  decoration: vscode.TextEditorDecorationType | null;
};

type BookmarksMap = {
  [filePath: string]: {
    [key: string]: BookmarkData;
  };
};

type BookmarksStateDump = {
  [filePath: string]: number[];
};

type BookmarkNotes = {
  [filePath: string]: {
    [line: number]: string;
  };
};

function getKey(line: number) {
  return `b${line}`;
}

// 导出getKey函数
export { getKey };

// 添加事件发送器
export const onBookmarksChanged = new vscode.EventEmitter<void>();

export const bookmarksManager = {
  bookmarks: {} as BookmarksMap,
  filePath: "" as string | undefined,
  notes: {} as BookmarkNotes,

  // @ts-ignore
  _getBookmarks(key: string | null = null): { [key: string]: BookmarkData } {
    if (!this.filePath) {
      return {};
    }

    if (!this.bookmarks[this.filePath]) {
      this.bookmarks[this.filePath] = {};
    }

    return key
      ? { [key]: this.bookmarks[this.filePath][key] }
      : this.bookmarks[this.filePath];
  },

  _setBookmarks(
    key: string | null = null,
    value: BookmarkData | null = null,
    deleteKey: boolean = false
  ) {
    if (this.filePath) {
      if (!this.bookmarks[this.filePath]) {
        this.bookmarks[this.filePath] = {};
      }

      if (key) {
        if (deleteKey) {
          delete this.bookmarks[this.filePath][key];
          onBookmarksChanged.fire();
          return;
        }
        this.bookmarks[this.filePath][key] = value as BookmarkData;
        onBookmarksChanged.fire();
      } else {
        this.bookmarks[this.filePath] = {};
        onBookmarksChanged.fire();
      }
    }
  },

  _getLines() {
    const bookmarks = this._getBookmarks();
    return Object.values(bookmarks)
      .map((bookmark) => bookmark.line)
      .sort((a, b) => a - b);
  },

  _clearBookmarks() {
    const bookmarks = this._getBookmarks();
    Object.values(bookmarks).forEach((bookmark) => {
      if (bookmark.decoration) {
        bookmark.decoration.dispose();
      }
    });
    this._setBookmarks();
    onBookmarksChanged.fire();
  },

  _clearBookmarksAtLines(lines: number[]) {
    let someCleared = false;

    lines
      .map((l) => getKey(l))
      .forEach((key) => {
        const bookmark = this._getBookmarks(key)[key];
        if (bookmark) {
          if (bookmark.decoration) {
            bookmark.decoration.dispose();
          }
          this._setBookmarks(key, null, true);
          // 删除对应的备注
          if (this.filePath) {
            this.deleteBookmarkNote(this.filePath, bookmark.line);
          }
          someCleared = true;
        }
      });

    if (someCleared) {
      // 检查当前文件是否还有书签，如果没有则删除该文件的记录
      const bookmarks = this._getBookmarks();
      if (this.filePath && Object.keys(bookmarks).length === 0) {
        delete this.bookmarks[this.filePath];
      }
      // 保存状态
      const context = getExtensionContext();
      if (context) {
        this._saveToState(context);
      }
      onBookmarksChanged.fire();
    }
    return someCleared;
  },

  _getStoredData(context: vscode.ExtensionContext): BookmarksStateDump {
    try {
      const data: BookmarksStateDump = JSON.parse(
        context.workspaceState.get(storeKey, "{}")
      );
      return data;
    } catch (ex) {
      logger.error(
        `_getStoredData ${ex instanceof Error ? ex.message : String(ex)}`
      );
      return {};
    }
  },

  _saveToState(context: vscode.ExtensionContext) {
    if (!this.filePath) {
      return;
    }

    const data = {
      ...this._getStoredData(context),
      [this.filePath]: this._getLines(),
    };
    const saveData: BookmarksStateDump = {};

    Object.keys(data).forEach((filePath) => {
      const lines = data[filePath];
      if (lines.length && fileExists(filePath)) {
        saveData[filePath] = lines;
      }
    });

    logger.info(`will save ${JSON.stringify(saveData)}`);

    context.workspaceState.update(storeKey, JSON.stringify(saveData));
  },

  _loadFromState(context: vscode.ExtensionContext) {
    const data = this._getStoredData(context);
    if (this.filePath) {
      this._setBookmarkLines(context, data[this.filePath]);
    }
  },

  _setBookmarkLines(context: vscode.ExtensionContext, lines?: number[]) {
    this._clearBookmarks();

    if (!this.filePath || !lines?.length) {
      return;
    }

    logger.info(`will load bookmarks for lines ${lines}`);

    // 确保当前文件的书签数据存在
    if (!this.bookmarks[this.filePath]) {
      this.bookmarks[this.filePath] = {};
    }

    // 创建装饰器并保存书签数据
    lines.forEach((line) => {
      const key = getKey(line);
      const decoration = createDecoration(context);
      const range = line2range(line);
      vscode.window.activeTextEditor?.setDecorations(decoration, [range]);
      this.bookmarks[this.filePath!][key] = { line, decoration };
    });

    onBookmarksChanged.fire();
  },

  _bookmarkLine(line: number, context: vscode.ExtensionContext) {
    const key = getKey(line);
    const decoration = createDecoration(context);

    const range = line2range(line);
    vscode.window.activeTextEditor?.setDecorations(decoration, [range]);
    this._setBookmarks(key, { line, decoration });
    // 保存状态
    this._saveToState(context);
    onBookmarksChanged.fire();
  },

  loadForFile(filePath: string | undefined, context: vscode.ExtensionContext) {
    // Dump current state first.
    this._saveToState(context);

    // Load new one.
    this.filePath = filePath;
    this._loadFromState(context);
    onBookmarksChanged.fire();
  },

  init(context: vscode.ExtensionContext) {
    this._loadNotesFromState(context);
    // 获取当前文件路径
    const currentFilePath =
      vscode.window.activeTextEditor?.document?.uri.fsPath;
    // 加载所有文件的书签数据
    const data = this._getStoredData(context);

    // 先加载其他文件的书签数据（不创建装饰器）
    Object.keys(data).forEach((filePath) => {
      if (filePath !== currentFilePath && fileExists(filePath)) {
        this.bookmarks[filePath] = {};
        data[filePath].forEach((line) => {
          const key = getKey(line);
          const decoration = createDecoration(context);
          this.bookmarks[filePath][key] = { line, decoration };
        });
      }
    });

    // 最后加载当前文件的书签
    if (currentFilePath) {
      this.filePath = currentFilePath;
      if (data[currentFilePath]) {
        this._setBookmarkLines(context, data[currentFilePath]);
      }
    }
    onBookmarksChanged.fire();
  },

  toggleBookmarks(context: vscode.ExtensionContext) {
    if (!vscode.window.activeTextEditor) {
      return;
    }

    const mainSelection = vscode.window.activeTextEditor.selection;
    if (
      vscode.window.activeTextEditor.selections.length === 1 &&
      mainSelection.start.line < mainSelection.end.line
    ) {
      // If there are some markers inside selection - we just clear them.
      if (
        this._clearBookmarksAtLines(
          createLinesRange(mainSelection.start.line, mainSelection.end.line)
        )
      ) {
        return;
      }
    }

    const lines = vscode.window.activeTextEditor.selections.map(
      (selection) => selection.active.line
    );

    const currentLines = this._getLines();
    const newLines = lines.filter((l) => !currentLines.includes(l));

    if (newLines.length) {
      newLines.forEach((l) => this._bookmarkLine(l, context));
      // 保存状态
      this._saveToState(context);
    } else {
      this._clearBookmarksAtLines(lines);
    }
    onBookmarksChanged.fire();
  },

  clearAllBookmarks(context: vscode.ExtensionContext) {
    // 清除所有文件的所有书签装饰器
    Object.keys(this.bookmarks).forEach((filePath) => {
      Object.values(this.bookmarks[filePath]).forEach((bookmark) => {
        if (bookmark.decoration) {
          bookmark.decoration.dispose();
        }
      });
    });

    // 清除所有书签数据
    this.bookmarks = {};

    // 清除所有备注
    this.notes = {};

    // 保存清空后的状态
    context.workspaceState.update(storeKey, "{}");
    this._saveNotesToState(context);

    // 触发更新事件
    onBookmarksChanged.fire();
  },

  clearCurrentFileBookmarks(context: vscode.ExtensionContext) {
    if (!this.filePath) {
      return;
    }

    // 清除当前文件的所有书签装饰器
    if (this.bookmarks[this.filePath]) {
      Object.values(this.bookmarks[this.filePath]).forEach((bookmark) => {
        if (bookmark.decoration) {
          bookmark.decoration.dispose();
        }
      });

      // 删除当前文件的书签数据
      delete this.bookmarks[this.filePath];

      // 删除当前文件的备注
      if (this.notes[this.filePath]) {
        delete this.notes[this.filePath];
      }

      // 保存更新后的状态
      this._saveToState(context);
      this._saveNotesToState(context);

      // 触发更新事件
      onBookmarksChanged.fire();
    }
  },

  navigateToNext() {
    this._navigateToLine(getNextLine);
  },

  navigateToPrev() {
    this._navigateToLine(getPrevLine);
  },

  _navigateToLine(
    lineGetter: (lines: number[], currentLine: number) => number
  ) {
    if (!vscode.window.activeTextEditor) {
      return;
    }

    const currentLine = vscode.window.activeTextEditor.selection.active.line;
    const lines = this._getLines();

    let nextLine = lineGetter(lines, currentLine);

    logger.info(
      `try to navigate from current line which is ${currentLine} to ${nextLine}`
    );

    moveCursorToLine(nextLine);
  },

  handleTextChanges(
    context: vscode.ExtensionContext,
    contentChanges: ReadonlyArray<vscode.TextDocumentContentChangeEvent>
  ) {
    if (!contentChanges.length) {
      return;
    }

    let lines = this._getLines();
    contentChanges.forEach((contentChange) => {
      lines = handleEdit(lines, contentChange);
    });

    this._clearBookmarks();
    this._setBookmarkLines(context, lines);

    if (isDebug()) {
      this._saveToState(context);
      this._loadFromState(context);
    }
  },

  // 获取书签备注
  getBookmarkNote(filePath: string, line: number): string | undefined {
    return this.notes[filePath]?.[line];
  },

  // 设置书签备注
  setBookmarkNote(filePath: string, line: number, note: string) {
    if (!this.notes[filePath]) {
      this.notes[filePath] = {};
    }
    this.notes[filePath][line] = note;
    onBookmarksChanged.fire();
  },

  // 删除书签备注
  deleteBookmarkNote(filePath: string, line: number) {
    if (this.notes[filePath]) {
      delete this.notes[filePath][line];
      if (Object.keys(this.notes[filePath]).length === 0) {
        delete this.notes[filePath];
      }
    }
    onBookmarksChanged.fire();
  },

  // 保存备注到状态
  _saveNotesToState(context: vscode.ExtensionContext) {
    context.workspaceState.update(notesStoreKey, this.notes);
  },

  // 从状态加载备注
  _loadNotesFromState(context: vscode.ExtensionContext) {
    const notes = context.workspaceState.get<BookmarkNotes>(notesStoreKey, {});
    this.notes = notes;
  },
};
