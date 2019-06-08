'use strict';

export interface RunArgs {
  name: string,  //task name
  trimOutput?: boolean  //whether to trim whitespace from the output
}

export interface ConfigureArgs {
  templateDir: string  //directory whose content to be copied and interpolated to .vscode
}

export interface VariableConfig {
  [variableName: string]: {  //variable name should match regex ^[A-Z0-9_]+$
    description?: string,  //description of the variable to be shown
    values?: string[]  //values.length > 1 shows a list, else an input box with values[0] filled in
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
        }
      },
      'additionalProperties': false
    }
  },
  'additionalProperties': false
}
