# Tasker
VS Code extension to configure & execute tasks. 


## tasker.configure
* The command allows you to configure the `.vscode` directory. 
* The command expects you to supply a directory `<template-dir>` and the content is copied to `.vscode` directory.
* Store your [Mustache](https://github.com/janl/mustache.js) templates with `.tct` extension in `<template-dir>`. 
* The command will interpolate the content of `.tct` files using `<template-dir>\variables.json`.
* After interpolation `<template-dir>\path\to\x.y.tct` will be stored as `.vscode\path\to\x.y`.

Format of `variables.json` is given below
```typescript
{
  [variableName: string]: {  //variable name
    description?: string,  //description of the variable to be shown
    default?: string  //default value for the variable
  }
}
```

Arguments can be supplied in the format given below
```typescript
{
  templateDir: string  //directory whose content to be copied and interpolated to .vscode
}
```


## tasker.run
* Command invokes the task and returns `Promise<string>`.
* Meant to be used programmatically or from the input command variable.

Arguments can be supplied in the format given below
```typescript
{
  name: string,  //task name
  trimOutput?: boolean  //whether to trim whitespace from the output
}
```
