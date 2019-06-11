'use strict';
import * as vscode from 'vscode';
import * as types from './types';

const TASK_PREFIX = 'tasker@';

class Runner {
  public readonly task: vscode.Task;
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

  public static async getTask(name: string): Promise<vscode.Task> {
    const tasks = await vscode.tasks.fetchTasks();

    for(let i = 0; i < tasks.length; ++i) {
      if(tasks[i].name == name) 
        return tasks[i];
    }
    
    throw new Error(`${name} - Task not found`);
  }

  public constructor(task: vscode.Task, trimOutput: boolean) {
    this.task = task;
    this.trimOutput = trimOutput;
  }

  public getOutput(): string {
    return this.trimOutput ? this.output.trim() : this.output;
  }

  public terminate(): void {
    this.execution && this.execution.terminate();
    this.execution = null;
  }

  public async execute(): Promise<string> {
    this.promise.instance = this.promise.instance || (async () => {
      const promise = new Promise<string>((resolve, reject) => {
        this.promise.callbacks = {resolve, reject};
      });

      this.setupHandlers();
      this.execution = await vscode.tasks.executeTask(this.task);
      return promise;
    })();

    return this.promise.instance;
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
    if(terminal.name.indexOf(this.task.name) >= 0) {
      this.writeDataHandler = (<any>terminal).onDidWriteData((data: string) => {
        this.output += data;
      });

      return true;
    }

    return false;
  }

  private setupHandlers(): void {
    this.startTaskHandler = vscode.tasks.onDidStartTask((e) => {
      if(this.task.name != e.execution.task.name)
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
      this.task.name == e.execution.task.name && this.done(false, this.getOutput());
    });
  }
}

export async function run(args: types.RunArgs): Promise<string> {
  const {taskName = '', trimOutput = true, dummyCommand = 'printf ""'} = args || {};

  if(!taskName)
    throw new Error('No task name given');

  const currentTaskName = `${TASK_PREFIX}${Date.now()}`;
  const task = await Runner.getTask(taskName);
  task.name = currentTaskName;
  task.presentationOptions = task.presentationOptions || {};
  task.presentationOptions.panel = vscode.TaskPanelKind.Shared
  
  if(dummyCommand) {
    const dummyTask = new vscode.Task(
      {type: 'shell'}, vscode.TaskScope.Workspace, 
      currentTaskName, 'Workspace', new vscode.ShellExecution(dummyCommand)
    );

    dummyTask.presentationOptions = {
      echo: false,
      clear: false,
      panel: vscode.TaskPanelKind.Shared,
      reveal: vscode.TaskRevealKind.Never,
      showReuseMessage: false
    };

    await (new Runner(dummyTask, true)).execute();
  }

  return (new Runner(task, trimOutput)).execute();
}
