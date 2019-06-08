'use strict';
import * as vscode from 'vscode';
import * as types from './types';

class Tasker {
  public readonly name: string;
  private trimOutput: boolean;
  private output: string;
  public taskExec: vscode.TaskExecution | null;

  private promise: {
    resolve?: (value?: any) => void;
    reject?: (error?: any) => void;
  };

  public constructor(name: string, trimOutput: boolean = true) {
    this.name = name;
    this.trimOutput = trimOutput;
    this.output = '';
    this.promise = {};
    this.taskExec = null;
  }

  public resolve(value?: any): boolean {
    if(this.promise.resolve) {
      if(typeof value == 'undefined')
        value = this.trimOutput ? this.output.trim() : this.output;

      this.promise.resolve(value);
      return true;
    }

    return false;
  }

  private reject(error?: any): boolean {
    if(this.promise.reject) {
      this.promise.reject(error || new Error(`${this.name} - Failed run!`));
      return true;
    }
    
    return false;
  }

  public run(): Promise<string> {
    return new Promise((resolve, reject) => {
      this.promise = {resolve, reject};
      
      vscode.tasks.fetchTasks().then((tasks) => {
        for(let i = 0; i < tasks.length; ++i) {
          if(tasks[i].name == this.name)			
            return vscode.tasks.executeTask(tasks[i]).then((taskExec) => {
              this.taskExec = taskExec;
            }, reject);
        }

        reject(new Error(`${this.name} - Task not found`));
      }, reject);
    });
  }

  public append(data: string): void {
    this.output += data;
  }
}

export function run(args: types.RunArgs): Promise<string> {
  return new Promise((resolve, reject) => {
    args = args || {};

    if(!args.name)
      return reject(new Error('No task name given'));

    let startTaskHandler: vscode.Disposable | null = null;
    let endTaskHandler: vscode.Disposable | null = null;
    let openTerminalHandler: vscode.Disposable | null = null;
    let writeDataHandler: vscode.Disposable | null = null;
    const tasker: Tasker = new Tasker(args.name, args.trimOutput);

    function done(): void {
      startTaskHandler && startTaskHandler.dispose();
      endTaskHandler && endTaskHandler.dispose();
      openTerminalHandler && openTerminalHandler.dispose();
      writeDataHandler && writeDataHandler.dispose();
    }

    function setWriteDataHandler(terminal: vscode.Terminal): boolean {
      if(terminal.name.indexOf('Task - ' + tasker.name) >= 0) {
        writeDataHandler = (<any>terminal).onDidWriteData((data: any) => {
          tasker.append(data);
        });

        return true;
      }

      return false;
    }

    startTaskHandler = vscode.tasks.onDidStartTask((e) => {
      if(!tasker || tasker.name != e.execution.task.name)
        return;

      const terminals = vscode.window.terminals;
      const count = terminals.length;

      for(let i = 0; i < count; ++i) {
        if(setWriteDataHandler(terminals[i]))
          break;
      }

      if(!writeDataHandler) {
        openTerminalHandler = vscode.window.onDidOpenTerminal((terminal) => {
          setWriteDataHandler(terminal);
        }); 
      }
    });

    endTaskHandler = vscode.tasks.onDidEndTask((e) => {
      tasker.name == e.execution.task.name && tasker.resolve();
    });

    tasker.run().then((value) => {
      done();
      resolve(value);
    }, (error) => {
      done();
      reject(error);
    });
  });
}
