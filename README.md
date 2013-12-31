flashlight
==========

A command-line tool to inspect your Node.js project dependencies for problems.
Each module is tested to see if:

* engine.node is satisfied by current node version
* module has a:
    * scripts.test, error if missing
    * version, error if missing
    * repository.url, warning if missing
    * bugs.url, warning if missing
    * homepage, warning if missing
    * license, warning if missing
* version is semver compliant, error if not
* tests run successfully with 'npm test', error if not
* the version is the latest from NPM, warning if not

## Installation

    sudo npm install -g flashlight

## Usage
Usage: flashlight \[-flags\] \[--options\]

Flags:
<table>
<tr><td><b>Flag</b></td><td><b>Meaning</b></td></tr>
<tr><td>-a</td><td>Display all modules in report. By default, only the modules with errors are displayed, or if "-w" is set, only those modules with errors or warnings.</td></tr>
<tr><td>-d #</td><td>Limit the depth of module discovery to # levels. If # < 1, then the depth is unlimited. The default is 1, the modules in your package.json.</td></tr>
<tr><td>-l</td><td>Display license, if available.</td></tr>
<tr><td>-p #</td><td>Sets the number of concurrent tasks to #, where # is a positive integer. The default is "-p 5".</td></tr>
<tr><td>-t</td><td>Displays the output from the tests (more readable with "-p 1") The default is to not display test output.</td></tr>
<tr><td>-v</td><td>Verbose flag. Show messages displaying what flashlight is doing. The default has verbose disabled.</td></tr>
<tr><td>-w</td><td>Display warnings in the module report. By default, warnings are not displayed.</td></tr>
</table>

Options:
<table>
<tr><td><b>Option</b></td><td><b>Meaning</b></td></tr>
<tr><td>--help</td><td>Shows the help screen and exits.</td></tr>
<tr><td>--packagejson PATH</td><td>Process the module described by the path. If not specified, uses the current working directory and looks for a package.json.</td></tr>
<tr><td>--version</td><td>Shows the current version of flashlight and exits.</td></tr>
<tr><td>--whitelist "comma,separated,module,name,list"</td><td>Skips all tests for the specified modules.</td></tr>
</table>

If there is a "flashlight.json" file in the current working directory, it is
read and the existing defaults are over-written with the values in the file.
Flashlight sets flags and options after the JSON file is read and the command
line settings overwrite the values in "flashlight.json".

The current working directory is where you run flashlight and not the directory
set by --packagejson. An example flashlight.json file follows:

```JSON
    {
      "depth": 1,
      "path": "/Users/edmond/src/flashlight",
      "parallel": 8,
      "showAll": true,
      "showLicense": true,
      "testOutput": false,
      "verbose": true,
      "warnings": false,
      "whitelist": {
      "async": true,
      "lodash": true,
      "npm": true,
      "debug": true
      }
    }
```

When flashlight exits, the exit code is the number of errors found. If the -w
flag was present, then the exit code is the sum of the errors and warnings.

## Examples
Use the package.json in the current directory, run the tests for all dependencies and sub-dependencies, display the output, use verbose to show what is happening and have a concurrency of 1:

    flashlight -tvp 1

Use the package.json in ~/src/myproject, display all modules and their license with errors, if any:

    flashlight -al --packageJson ~/src/myproject

Use the package.json in the current working directory and find errors and warnings for all dependencies:

    flashlight -w

## LICENSE
The MIT License (MIT)

Copyright (c) 2013 Edmond Meinfelder

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

