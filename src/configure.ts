'use strict';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import {ncp} from 'ncp';
import * as types from './types';

const TEMPLATE_FILE_EXT = '.tct';
const mustache = require('mustache');
mustache.escape = (text: string) => JSON.stringify(text).replace(/(^")|("$)/g, '');

class Variables {
  private variables: types.VariableConfig;

  public constructor() {
    this.variables = {};
  }

  public load(variablesFile: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      fs.readFile(variablesFile, (error, data) => {
        if(error)
          return reject(error);
  
        try {
          var configs = JSON.parse(data.toString('utf8'));
          var keys = Object.keys(configs);
          var variables = keys.filter((key) => key.match(/^[A-Z0-9_]+$/) != null && key);
        } catch(error) {
          return reject(error);
        }
        
        const getVariables = (index: number) => {
          if(index >= variables.length)
            return resolve(true);

          const variable = variables[index];
          const config = configs[variable];

          vscode.window.showInputBox({
            prompt: config.description || variable,
            value: config.default || '',
            ignoreFocusOut: true,
          }).then((value) => {
            if(!value)
              return resolve();

            this.variables[variable] = value;
            getVariables(index + 1);    
          }, reject);
        };
       
        if(keys.length != variables.length)
          reject(new Error(`${variablesFile} contains invalid variables`));
        else
          getVariables(0);
      });
    });
  }

  public eval(srcFile: string, tgtFile: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      fs.readFile(srcFile, (error, data) => {
        if(error)
          return reject(error);
  
        let output = mustache.render(data.toString('utf8'), this.variables);
        fs.writeFile(tgtFile, output, (error) => error ? reject(error) : resolve(true));
      });
    });
  }
}

export function configure(args: types.ConfigureArgs): Promise<string> {
  return new Promise((resolve, reject) => {
    args = args || {};
    const folders = vscode.workspace.workspaceFolders || [];
    const promises: Promise<boolean>[] = [];

    function execute(folder: vscode.WorkspaceFolder, srcDir: string): void {
      const variables = new Variables();
      let tgtDir = path.join(folder.uri.fsPath, '.vscode');
      let variablesFile = path.join(srcDir, 'variables.json');

      if(!fs.existsSync(variablesFile) || !fs.lstatSync(variablesFile).isFile()) {
        vscode.window.showWarningMessage(
          `${variablesFile} does not exist! ${TEMPLATE_FILE_EXT} files may render incompete`
        );
        variablesFile = '';
      }

      (variablesFile ? variables.load(variablesFile) : Promise.resolve(true)).then((value) => {
        if(!value)
          return resolve();

        srcDir = fs.realpathSync(srcDir);
        tgtDir = fs.realpathSync(tgtDir);
        const isSrcNotTgt = srcDir != tgtDir;

        ncp(srcDir, tgtDir, {
          stopOnErr: true, 

          filter(srcFile) {
            if(srcFile.endsWith(TEMPLATE_FILE_EXT) && path.basename(srcFile) != TEMPLATE_FILE_EXT && 
              fs.lstatSync(srcFile).isFile()) {
              const tgtFile = path.join(tgtDir, path.relative(srcDir, srcFile)).slice(0, -1 * TEMPLATE_FILE_EXT.length);
              promises.push(variables.eval(srcFile, tgtFile));
              return false;
            }

            return isSrcNotTgt || fs.lstatSync(srcFile).isDirectory();
          }
        }, (error?: Error) => {
          if(error)
            return reject(error);

          Promise.all(promises).then(() => {
            vscode.window.showInformationMessage(`Configured ${folder.uri.path}`);
            resolve('done');
          }, reject);
        });
      }, reject);
    }

    function processFolder(folder: vscode.WorkspaceFolder): void {
      if(args.vscodeDir)
        return execute(folder, args.vscodeDir);

      vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        defaultUri: folder.uri,
        openLabel: 'Select'
      }).then((uris) => !uris ? resolve() : execute(folder, uris[0].fsPath), reject);
    }

    if(!folders.length)
      return reject(new Error('No workspace folder to configure'));
    else if(folders.length == 1)
      return processFolder(folders[0]);

    vscode.window.showWorkspaceFolderPick({
      placeHolder: 'Workspace folder to configure',
      ignoreFocusOut: true
    }).then((folder) => !folder ? resolve() : processFolder(folder), reject);    
  });
}
