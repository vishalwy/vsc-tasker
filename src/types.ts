'use strict';

export interface RunArgs {
  name: string, 
  trimOutput?: boolean
}

export interface ConfigureArgs {
  vscodeDir: string
}

export interface VariableConfig {
  [id: string]: string
}
