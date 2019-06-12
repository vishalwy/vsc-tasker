'use strict';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import {ncp} from 'ncp';
import {Validator} from 'jsonschema';
import * as types from './types';

const TEMPLATE_FILE_TYPE = '.tct';
const VARIABLE_FILE_NAME = 'tasker.variables.json';
const VSCODE_DIR = '.vscode';
const mustache = require('mustache');
mustache.escape = (text: string) => JSON.stringify(text).replace(/(^")|("$)/g, '');

class Variables {
  private variables: {[variableName: string]: string} = {};

  public async load(variablesFile: string): Promise<boolean> {
    const data = await new Promise<Buffer>((resolve, reject) => {
      fs.readFile(variablesFile, (error, data) => error ? reject(error) : resolve(data));
    });

    let config:types.VariableConfig = JSON.parse(data.toString('utf8'));
    const validation = (new Validator()).validate(config, types.VariableSchema);

    if(validation.errors.length)
      throw new Error(`${variablesFile}: ${validation.errors[0].property} - ${validation.errors[0].message}`);

    for(let i = 0, variables = Object.keys(config); i < variables.length; ++i) {
      let value = await this.readVariable(config, variables[i]);

      if(typeof value == 'undefined')
        return false;

      this.variables[variables[i]] = value;
    }

    return true;
  }

  public async eval(srcFile: string, tgtFile: string): Promise<true> {
    const data = await new Promise<Buffer>((resolve, reject) => {
      fs.readFile(srcFile, (error, data) => error ? reject(error) : resolve(data));
    });

    let output = mustache.render(data.toString('utf8'), this.variables);

    return new Promise<true>((resolve, reject) => {
      fs.writeFile(tgtFile, output, (error) => error ? reject(error) : resolve(true));
    });
  }

  private readVariable(config: types.VariableConfig, variable: string): Thenable<string | undefined> {
    const {description = variable, values = [], required = true} = config[variable];

    if(values.length > 1) {
      return vscode.window.showQuickPick(values, {
        placeHolder: description,
        ignoreFocusOut: true,
        canPickMany: false
      });
    } 

    return vscode.window.showInputBox({
      prompt: description,
      ignoreFocusOut: true,
      value: values.length ? values[0] : '',
      validateInput: (value) =>  required && value === '' ? 'Value cannot be empty' : ''
    });
  }
}

class Configurer {
  private promise: Promise<boolean> | null = null;

  public async execute(templateDir: string): Promise<boolean> {
    this.promise =  this.promise || (async () => {
      const folder = await this.getWorkspaceFolder();
      const dir = folder && await this.getTemplateDir(folder, templateDir);

      if(!folder || !dir)
        return false;

      return this.process(folder, dir);
    })();

    return this.promise;
  }

  private async getWorkspaceFolder(): Promise<vscode.WorkspaceFolder | undefined> {
    const folders = vscode.workspace.workspaceFolders || [];

    if(!folders.length)
      throw new Error('No workspace folder to configure');
    else if(folders.length == 1)
      return folders[0];

    return vscode.window.showWorkspaceFolderPick({
      placeHolder: 'Workspace folder to configure',
      ignoreFocusOut: true
    });
  }

  private async getTemplateDir(folder: vscode.WorkspaceFolder, templateDir: string): Promise<string | undefined> {
    if(templateDir) {
      if(fs.existsSync(templateDir) && fs.lstatSync(templateDir).isDirectory())
        return templateDir;
      else
        throw new Error(`Template dir - ${templateDir} does not exist`);          
    }

    const uris = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      defaultUri: folder.uri,
      openLabel: 'Select'
    });

    return uris && uris[0].fsPath;
  }

  private copy(srcDir: string, tgtDir: string): Promise<string[]> {
    return new Promise((resolve, reject) => {
      srcDir = fs.realpathSync(srcDir);
      tgtDir = fs.existsSync(tgtDir) ? fs.realpathSync(tgtDir) : tgtDir;
      const isSrcNotTgt = srcDir != tgtDir;
      let templateFiles: string[] = [];

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
        
        resolve(templateFiles);
      });
    });
  }

  private async process(folder: vscode.WorkspaceFolder, srcDir: string): Promise<boolean> {
    const variables = new Variables();
    const tgtDir = path.join(folder.uri.fsPath, VSCODE_DIR);
    let variablesFile = path.join(srcDir, VARIABLE_FILE_NAME);

    if(!fs.existsSync(variablesFile) || !fs.lstatSync(variablesFile).isFile()) {
      vscode.window.showWarningMessage(
        `${variablesFile} does not exist! ${TEMPLATE_FILE_TYPE} files may render incompete`
      );
      variablesFile = '';
    }

    if(variablesFile && !await variables.load(variablesFile))
      return false;

    const promises = (await this.copy(srcDir, tgtDir)).map((srcFile) => {
      const tgtFile = path.relative(srcDir, srcFile).slice(0, -1 * TEMPLATE_FILE_TYPE.length);
      return variables.eval(srcFile, path.join(tgtDir, tgtFile));
    });

    await Promise.all(promises);
    vscode.window.showInformationMessage(`Configured ${folder.uri.fsPath}`);
    return true;
  }
}

export async function configure(args: types.ConfigureArgs): Promise<string> {
  const {templateDir = ''} = args || {};
  const status = await (new Configurer()).execute(templateDir);
  return status ? 'Configured' : 'Cancelled';
}
