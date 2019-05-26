'use strict';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

const mustache = require('mustache');
mustache.escape = (text: string) => JSON.stringify(text).replace(/(^")|("$)/g, '');

export interface IVariableDetails {
  description?: string,
  default?: string
}

class Variables {
  private workspaceFolder: string;
  private variables: {[id: string]: string};

  public constructor(workspaceFolder: string) {
    this.workspaceFolder = workspaceFolder;
    this.variables = {};
  }
  
  public load() {
    return new Promise((resolve, reject) => {
      let file = path.join(this.workspaceFolder, '.vscode', 'variables.json');

      fs.readFile(file, (error, data) => {
        if(error)
          return reject(error);
  
        try {
          var configs = JSON.parse(data.toString('utf8'));
          var keys = Object.keys(configs);
          var variables = Object.keys(configs).filter((key: string) => key.match(/^[A-Z0-9_]+$/) != null && key);
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
          }).then((value?: string) => {
            if(!value)
              return resolve();

            this.variables[variable] = value;
            getVariables(index + 1);    
          }, reject);
        };
       
        if(!keys.length || keys.length != variables.length)
          reject(new Error(`${file} contain either invalid variables or no variables at all`));
        else
          getVariables(0);
      });
    });
  }

  public eval(srcFile: string, tgtFile: string) {
    return new Promise((resolve, reject) => {
      srcFile = path.join(this.workspaceFolder, srcFile);
      tgtFile = path.join(this.workspaceFolder, tgtFile);

      fs.readFile(srcFile, (error, data) => {
        if(error)
          return reject(error);
  
        let output = mustache.render(data.toString('utf8'), this.variables);
        fs.writeFile(tgtFile, output, (error: any) => error ? reject(error) : resolve(true));
      });
    });
  }
}

export function configure(args: {files: {[id:string]: string}}) {
  return new Promise((resolve, reject) => {
    args = args || {};
    args.files = args.files || {};
    const folders = vscode.workspace.workspaceFolders || [];
    const srcFiles = Object.keys(args.files);

    function execute(folder: vscode.WorkspaceFolder) {
      let variables = new Variables(folder.uri.path);

      variables.load().then((value) => {
        if(!value)
          return resolve();

        const promises = srcFiles.map((key: string) => variables.eval(key, args.files[key]));
        
        Promise.all(promises).then((values: any) => {
          vscode.window.showInformationMessage(`Configured ${folder.uri.path}`);
          resolve('done');
        }, reject);
      }, reject);
    }

    if(!folders.length)
      return reject(new Error('No workspace folder to configure'));
    else if(!srcFiles.length)
      return reject(new Error('No file mappings given'));
    else if(folders.length == 1)
      return execute(folders[0]);

    vscode.window.showWorkspaceFolderPick({
      placeHolder: 'Workspace folder to configure',
      ignoreFocusOut: true
    }).then((folder?: vscode.WorkspaceFolder) => !folder ? resolve() : execute(folder), reject);    
  });
}