'use strict';
import * as vscode from 'vscode';
import * as types from './types';

class Tasker {
  public readonly name: string;
  public readonly trimOutput: boolean;
  private output: string = '';
  private startTaskHandler: vscode.Disposable | null = null;
  private endTaskHandler: vscode.Disposable | null = null;
  private openTerminalHandler: vscode.Disposable | null = null;
  private writeDataHandler: vscode.Disposable | null = null;
  private execution: vscode.TaskExecution | null = null;

  private promise: {
    instance: Promise<string> | null,
    callbacks: {
      resolve: (value?: any) => void;
      reject: (error?: any) => void;
    } | null;
  } = {instance: null, callbacks: null};

  public constructor(name: string, trimOutput: boolean = true) {
    this.name = name;
    this.trimOutput = trimOutput;
    this.resolve = this.resolve.bind(this);
    this.reject = this.reject.bind(this);
  }

  public getOutput(): string {
    return this.trimOutput ? this.output.trim() : this.output;
  }

  public terminate(): void {
    this.execution && this.execution.terminate();
    this.execution = null;
  }

  public run(): Promise<string> {
    this.promise.instance = this.promise.instance || new Promise((resolve, reject) => {
      this.promise.callbacks = {resolve, reject};
      this.setupHanlders();
      
      vscode.tasks.fetchTasks().then((tasks) => {
        for(let i = 0; i < tasks.length; ++i) {
          if(tasks[i].name == this.name)			
            return vscode.tasks.executeTask(tasks[i]).then((execution) => {
              this.execution = execution;
            }, this.reject);
        }

        this.reject(new Error(`${this.name} - Task not found`));
      }, this.reject);
    });

    return this.promise.instance;
  }

  private resolve(value?: any): void {
    this.done(true, value);
  }

  private reject(error?: any): void {
    this.done(false, error);
  }

  private done(isError: boolean, valueOrError: any): void {
    if(!this.promise.callbacks)
      return

    const callback = isError ? this.promise.callbacks.reject : this.promise.callbacks.resolve;
    this.promise.callbacks = null;
    this.startTaskHandler && this.startTaskHandler.dispose();
    this.endTaskHandler && this.endTaskHandler.dispose();
    this.openTerminalHandler && this.openTerminalHandler.dispose();
    this.writeDataHandler && this.writeDataHandler.dispose();
    callback(valueOrError);
  }

  private setWriteDataHandler(terminal: vscode.Terminal): boolean {
    if(terminal.name.indexOf('Task - ' + this.name) >= 0) {
      this.writeDataHandler = (<any>terminal).onDidWriteData((data: any) => {
        this.output += data;
      });

      return true;
    }

    return false;
  }

  private setupHanlders(): void {
    this.startTaskHandler = vscode.tasks.onDidStartTask((e) => {
      if(this.name != e.execution.task.name)
        return;

      const terminals = vscode.window.terminals;
      const count = terminals.length;

      for(let i = 0; i < count; ++i) {
        if(this.setWriteDataHandler(terminals[i]))
          break;
      }

      if(!this.writeDataHandler) {
        this.openTerminalHandler = vscode.window.onDidOpenTerminal((terminal) => {
          this.setWriteDataHandler(terminal);
        }); 
      }
    });

    this.endTaskHandler = vscode.tasks.onDidEndTask((e) => {
      this.name == e.execution.task.name && this.resolve(this.getOutput());
    });
  }
}

export function run(args: types.RunArgs): Promise<string> {
  return new Promise((resolve, reject) => {
    args = args || {};

    if(!args.name)
      return reject(new Error('No task name given'));
    
    (new Tasker(args.name, args.trimOutput)).run().then(resolve, reject);
  });
}
