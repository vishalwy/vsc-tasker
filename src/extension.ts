'use strict';
import * as vscode from 'vscode';
import {run} from './run';
import {configure} from './configure';

export function activate(context: vscode.ExtensionContext) {
  const runCommand = vscode.commands.registerCommand('tasker.run', run);
  const configureCommand = vscode.commands.registerCommand('tasker.configure', configure);
  context.subscriptions.push(runCommand, configureCommand);
}

export function deactivate() {}
