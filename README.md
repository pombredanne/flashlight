flashlight
==========

A command-line tool to inspect your Node.js dependencies for potential problems.

## Installation

    sudo npm install -g flashlight

## Usage
Usage: flashlight \[-flags\] \[--options\]

Flags:
<table>
<tr><td><b>Flag</b></td><td><b>Meaning</b></td></tr>
<tr><td>-a</td><td>Display all modules in report. By default, only the modules with errors are displayed, or if "-w" is set, only those modules with errors or warnings.</td></tr>
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
<tr><td>--packageJson PATH</td><td>Process the module described by the path. If not specified, uses the current working directory and looks for a package.json.</td></tr>
<tr><td>--version</td><td>Shows the current version of flashlight and exits.</td></tr>
</table>

## Examples
Use the package.json in the current directory, run the tests for all dependencies and sub-dependencies, display the output, use verbose to show what is happening and have a concurrency of 1:

    flashlight -tvp 1

Use the package.json in ~/src/myproject, display all modules and their license with errors, if any:

    flashlight -al --packageJson ~/src/myproject

Use the package.json in the current working directory and find errors and warnings for all dependencies:

    flashlight -w

## Note
This is new. Please expect and report issues. Your feedback is welcome. 

In the future, I will add:

* Non-zero exit codes when errors are found and warnings when -w is present.
* Ability to flag modules having any of a list of licenses as errors.
* Ability to read configuration from a config file and environment variables.
* Tests

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

