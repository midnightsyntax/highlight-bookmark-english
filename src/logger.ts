import * as vscode from "vscode";
import { isDebug } from "./utils";

export const logger = {
  info: (message: string) =>
    isDebug() && vscode.window.showInformationMessage(message),
  error: (message: string) =>
    isDebug() && vscode.window.showErrorMessage(message),
};
