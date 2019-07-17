'use strict';
import * as vscode from 'vscode';
import * as types from './types';

const TASK_PREFIX = 'tasker@';
const PSEUDO_COMMAND = 'printf \'\'';

class Runner {
  public readonly task: vscode.Task;
  public readonly trimOutput: boolean;
  public readonly outputTimeout: number;
  private output: string = '';
  private outputTimer: NodeJS.Timer | null = null;
  private startTaskHandler: vscode.Disposable | null = null;
  private endTaskHandler: vscode.Disposable | null = null;
  private openTerminalHandler: vscode.Disposable | null = null;
  private writeDataHandler: vscode.Disposable | null = null;
  private execution: vscode.TaskExecution | null = null;

  private promise: {
    instance: Promise<string> | null,
    callbacks: {
      resolve: (value?: any) => void,
      reject: (error?: any) => void
    } | null
  } = {instance: null, callbacks: null};

  public static async getTask(name: string): Promise<vscode.Task> {
    const tasks = await vscode.tasks.fetchTasks();

    for(let i = 0; i < tasks.length; ++i) {
      if(tasks[i].name == name) 
        return tasks[i];
    }
    
    throw new Error(`${name} - Task not found`);
  }

  public constructor(task: vscode.Task, trimOutput: boolean, outputTimeout: number) {
    this.task = task;
    this.trimOutput = trimOutput;
    this.outputTimeout = outputTimeout > 0 ? outputTimeout : 0;
  }

  public getOutput(): string {
    return this.trimOutput ? this.output.trim() : this.output;
  }

  public terminate(): void {
    this.execution && this.execution.terminate();
    this.execution = null;
  }

  public execute(): Promise<string> {
    this.promise.instance = this.promise.instance || (async () => {
      const promise = new Promise<string>((resolve, reject) => {
        this.promise.callbacks = {resolve, reject};
      });

      try {
        this.setupHandlers();
        this.execution = await vscode.tasks.executeTask(this.task);
      } catch(error) {
        this.disposeCallbacks();
        throw error;
      }

      return promise;
    })();

    return this.promise.instance;
  }

  private done(isError: boolean, valueOrError: any): void {
    if(!this.promise.callbacks)
      return

    const callback = isError ? this.promise.callbacks.reject : this.promise.callbacks.resolve;
    this.disposeCallbacks();
    callback(valueOrError);
  }

  private disposeCallbacks(): void {
    this.outputTimer && clearTimeout(this.outputTimer)
    this.startTaskHandler && this.startTaskHandler.dispose();
    this.endTaskHandler && this.endTaskHandler.dispose();
    this.openTerminalHandler && this.openTerminalHandler.dispose();
    this.writeDataHandler && this.writeDataHandler.dispose();

    this.outputTimer = null;
    this.execution = null;
    this.promise.callbacks = null;
    this.startTaskHandler = null;
    this.endTaskHandler = null;
    this.openTerminalHandler = null;
    this.writeDataHandler = null;
  }

  private setWriteDataHandler(terminal: vscode.Terminal): boolean {
    if(terminal.name.indexOf(this.task.name) >= 0) {
      this.writeDataHandler = (<any>terminal).onDidWriteData((data: string) => {
        this.output += data;
      });

      if(this.outputTimeout)
        this.outputTimer = setTimeout(() => this.done(false, this.getOutput()), this.outputTimeout)

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
  const {taskName = '', trimOutput = true, outputTimeout = 0} = args || {};
  const pseudoCommand = vscode.workspace.getConfiguration('tasker').get<string>('pseudoCommand', PSEUDO_COMMAND);
  
  if(!taskName)
    throw new Error('No task name given');

  let task = await Runner.getTask(taskName);
  const taskScope = task.scope || vscode.TaskScope.Workspace;
  const currentTaskName = `${TASK_PREFIX}${Date.now()}`;
  const presentationOptions = task.presentationOptions || {};
  task = new vscode.Task(
    task.definition, taskScope, currentTaskName, 
    task.source, task.execution, task.problemMatchers
  );
  task.presentationOptions = presentationOptions;
  task.presentationOptions.panel = vscode.TaskPanelKind.Shared;

  if(pseudoCommand) {
    const pseudoTask = new vscode.Task(
      {type: 'shell'}, taskScope, currentTaskName, 
      task.source, new vscode.ShellExecution(pseudoCommand)
    );

    pseudoTask.presentationOptions = {
      echo: false,
      clear: false,
      panel: vscode.TaskPanelKind.Shared,
      reveal: vscode.TaskRevealKind.Never,
      showReuseMessage: false
    };

    await (new Runner(pseudoTask, true, 0)).execute();
  }

  return (new Runner(task, trimOutput, outputTimeout)).execute();
}
