'use strict';

export interface RunArgs {
  taskName: string,  //task name to execute
  trimOutput?: boolean  //whether to trim whitespace from the output; default to true
}

export interface ConfigureArgs {
  templateDir: string  //directory whose content to be copied and interpolated to .vscode
}

export interface VariableConfig {
  [variableName: string]: {  //variable name should match regex ^[A-Z0-9_]+$
    description?: string,  //description of the variable to be shown
    values?: string[],  //values.length > 1 shows a list, else an input box with values[0] filled in
    required?: boolean  //for simple input, this implies the value cannot be empty; default to true
  }
}

export const VariableSchema = {
  'type': 'object',
  'patternProperties': {
    '^[A-Z0-9_]+$': {
      'type': 'object',
      'properties': {
        'description': {
          'type': 'string'
        },
        'values': {
          'type': 'array',
          'items': {
            'type': 'string'
          }
        },
        'required': {
          'type': 'boolean'
        }
      },
      'additionalProperties': false
    }
  },
  'additionalProperties': false
}
