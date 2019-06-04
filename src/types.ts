'use strict';

export interface RunArgs {
  name: string,  //task name
  trimOutput?: boolean  //whether to trim whitespace from the output
}

export interface ConfigureArgs {
  templateDir: string  //directory whose content to be copied and interpolated to .vscode
}

export interface VariableConfig {
  [variableName: string]: {  //variable name
    description?: string,  //description of the variable to be shown
    default?: string  //default value for the variable
  }
}
