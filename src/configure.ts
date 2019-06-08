'use strict';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import {ncp} from 'ncp';
import {Validator} from 'jsonschema';
import * as types from './types';

const TEMPLATE_FILE_TYPE = '.tct';
const VARIABLE_FILE_NAME = 'tasker.variables.json'
const mustache = require('mustache');
mustache.escape = (text: string) => JSON.stringify(text).replace(/(^")|("$)/g, '');

class Variables {
  private variables: {[variableName: string]: string};

  public constructor() {
    this.variables = {};
  }

  public load(variablesFile: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      fs.readFile(variablesFile, (error, data) => {
        if(error)
          return reject(error);

        let config: types.VariableConfig, variables: string[];
  
        try {
          config = JSON.parse(data.toString('utf8'));
          const validation = (new Validator()).validate(config, types.VariableSchema);

          if(validation.errors.length)
            throw new Error(`${validation.errors[0].property} - ${validation.errors[0].message}`)

          variables = Object.keys(config);
        } catch(error) {
          return reject(error);
        }
        
        const getVariables = (index: number) => {
          if(index >= variables.length)
            return resolve(true);

          const variable = variables[index];
          const description = config[variable].description || variable;
          const values = config[variable].values || [];
          let input: Thenable<string | undefined>;

          if(values.length > 1) {
            input = vscode.window.showQuickPick(values, {
              placeHolder: description,
              ignoreFocusOut: true,
              canPickMany: false
            })
          } else {
            input = vscode.window.showInputBox({
              prompt: description,
              ignoreFocusOut: true,
              value: values.length ? values[0] : ''
            })  
          }

          input.then((value) => {
            if(!value)
              return resolve();

            this.variables[variable] = value;
            getVariables(index + 1);    
          }, reject);
        };
       
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

    function execute(folder: vscode.WorkspaceFolder, srcDir: string): void {
      const variables = new Variables();
      let tgtDir = path.join(folder.uri.fsPath, '.vscode');
      let variablesFile = path.join(srcDir, VARIABLE_FILE_NAME);
      let templateFiles: string[] = [];

      if(!fs.existsSync(variablesFile) || !fs.lstatSync(variablesFile).isFile()) {
        vscode.window.showWarningMessage(
          `${variablesFile} does not exist! ${TEMPLATE_FILE_TYPE} files may render incompete`
        );
        variablesFile = '';
      }

      (variablesFile ? variables.load(variablesFile) : Promise.resolve(true)).then((value) => {
        if(!value)
          return resolve();

        srcDir = fs.realpathSync(srcDir);
        tgtDir = fs.existsSync(tgtDir) ? fs.realpathSync(tgtDir) : tgtDir;
        const isSrcNotTgt = srcDir != tgtDir;

        ncp(srcDir, tgtDir, {
          stopOnErr: true, 

          filter(srcFile) {
            if(srcFile.endsWith(TEMPLATE_FILE_TYPE) && path.basename(srcFile) != TEMPLATE_FILE_TYPE && 
              fs.lstatSync(srcFile).isFile()) {
              templateFiles.push(srcFile);
              return isSrcNotTgt;
            }

            return isSrcNotTgt || fs.lstatSync(srcFile).isDirectory();
          }
        }, (error?: Error) => {
          if(error)
            return reject(error);

          const promises = templateFiles.map((srcFile) => {
            const tgtFile = path.relative(srcDir, srcFile).slice(0, -1 * TEMPLATE_FILE_TYPE.length);
            return variables.eval(srcFile, path.join(tgtDir, tgtFile));
          });

          Promise.all(promises).then(() => {
            vscode.window.showInformationMessage(`Configured ${folder.uri.path}`);
            resolve('done');
          }, reject);
        });
      }, reject);
    }

    function processFolder(folder: vscode.WorkspaceFolder): void {
      if(args.templateDir)
        return execute(folder, args.templateDir);

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
