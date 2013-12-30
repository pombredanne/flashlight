/**
 * @fileOverview
 * This is a place where misc functions go that don't fit anywhere else.
 * The only commonality is none of them have functionality core to flashlight.
 */
'use strict';

module.exports = {
    writeToFile: writeToFile,
    checkAttr: checkAttr,
    getPropertyVal: getPropertyVal,
    spawnChild: spawnChild,
    showHelp: showHelp,
    cmdLineArgs: cmdLineArgs,
    depChainFromPath: depChainFromPath
};

var path = require('path');
var have = require('have');
var is = require('is2');
var debug = require('debug')('flashlight');
var fs = require('fs');

/**
 * Using the path to discovered package.json, parse the implied module
 * dependendcy chain.
 * @param {String} pathToPkgJson Qualified path to package.json
 * @return {String} A string describing the module dependencies
 */
function depChainFromPath(pathToPkgJson) {
    have(arguments, { pathToPkgJson: 'str' });
    pathToPkgJson = pathToPkgJson.replace(path.join(process.cwd(),'..'), '');
    pathToPkgJson = pathToPkgJson.replace(/\/package\.json$/, '');
    pathToPkgJson = pathToPkgJson.replace(/node_modules/g, '');
    pathToPkgJson = pathToPkgJson.split(path.sep);
    pathToPkgJson = pathToPkgJson.filter(function(s) { return is.nonEmptyStr(s); });
    pathToPkgJson = pathToPkgJson.join(' > ');
    return pathToPkgJson;
}

/**
 * Handle the command line arguments, by setting the correct globals.
 * @param {Object} The command-line arguments from optimist.
 */
function cmdLineArgs(argv, g) {
    have(arguments, { argv: 'obj', g: 'obj' });

    if (argv.help) {
        showHelp();
        process.exit(0);
    }
    if (argv.a) {
        g.showAll = argv.a;
        debug('Setting showAll to: '+g.showAll);
    }
    if (argv.l) {
        g.showLicense = argv.l;
        debug('Setting showLicense to: '+g.showLicense);
    }
    if (argv.p) {
        if (is.positiveInt(argv.p)) {
            g.parallel = argv.p;
            debug('Setting parallel to: '+g.parallel);
        } else {
            console.error('Invalid setting for -p: '+argv.p+', using default "-p 5".');
        }
    }
    if (argv.v) {
        g.verbose = true;
        debug('Setting verbose to: '+g.verbose);
    }
    if (argv.w) {
        g.warnings = true;
        debug('Now displaying warnings.');
    }
    if (argv.t) {
        g.testOutput = true;
        debug('Now displaying test output.');
    }
    if (argv.version) {
        var ver = require('./package.json').version;
        console.log('flashlight v'+ver);
        process.exit(0);
    }
    if (is.nonEmptyStr(argv.packageJson)) {
        var pathToPackage = path.resolve(argv.packageJson);
        console.log('pathToPackage:',pathToPackage);
        if (fs.existsSync(pathToPackage)) {
            process.chdir(path.dirname(pathToPackage));
            debug('Setting current working directory to: '+path);
        } else {
            console.error('Failed to set current working directory to: '+path+
                 ', the path does not exist.');
            process.exit(1);
        }
    }
}

/**
 * A low-rent way to show the help text.
 */
function showHelp() {
    console.log('Usage: flashlight [-flags] [--options]\n');
    console.log('Flags:\n');
    console.log('    -a    Display all modules in report. By default, only the modules');
    console.log('          with errors are displayed, or if "-w" is set, only those');
    console.log('          modules with errors or warnings.');
    console.log('\n');
    console.log('    -l    Display license, if available.');
    console.log('\n');
    console.log('    -p #  Sets the number of concurrent tasks to #, where # is a positive');
    console.log('          integer. The default is "-p 5".');
    console.log('\n');
    console.log('    -t    Displays the output from the tests (more readable with "-p 1")');
    console.log('          The default is to not display test output.');
    console.log('\n');
    console.log('    -v    Verbose flag. Show messages displaying what flashlight is doing.');
    console.log('          The default has verbose disabled.');
    console.log('\n');
    console.log('    -w    Display warnings in the module report. By default, warnings are');
    console.log('          not displayed.');
    console.log('\n');
    console.log('Options:\n');
    console.log('    --help');
    console.log('          Shows this screen.');
    console.log('\n');
    console.log('    --packageJson <path to a package.json file>');
    console.log('          Process the module described by the file. If not specified,');
    console.log('          uses the current working directory and looks for a package.json.');
    console.log('\n');
    console.log('    --version');
    console.log('          Shows the current version of flashlight.');
}

/**
 * Perform a command in the appropriate directory. Calls the callback when done.
 * @param {String} cmd The command to execute.
 * @param {String[]} args The command-line arguments passed to cmd.
 * @param {String} cwd The working directory for the `npm test` command.
 * @param {Function} cb The callback, called when done. An error indicates the tests failed.
 */
function spawnChild(cmd, args, cwd, cb) {
    have(arguments, { cmd: 'str', args: 'str array', cwd: 'str', cb: 'func' });

    var spawn = require('child_process').spawn;
    var child = spawn(cmd, args, {cwd:cwd});

    // we need these handlers - some tests use stdout & stderr
    child.stdout.on('data', function (data) {
        if (global.g.testOutput) process.stdout.write(data);
    });

    child.stderr.on('data', function (data) {
        if (global.g.testOutput) process.stderr.write(data);
    });

    child.on('close', function (code) {
        if (code !== 0) {
            return cb(new Error('exited with code: '+code));
        } else {
            cb();
        }
    });
}

/**
 * A convenience function to iterate down a string path into an object. If no
 * such path exists, returns the default value, else the value of the property.
 * @param {Object} obj The object to traverse.
 * @param {String} property The string name of the property.
 * @param defaultVal The default value to return if no property was found.
 * @return Property value if found, else the default value.
 */
function getPropertyVal(obj, property, defaultVal) {
    have(arguments, { obj: 'obj', property: 'str' });

    var properties = property.split('.');
    var currVal = obj;

    for (var i=0; i<properties.length; i++) {
        var currPropertyName = properties[i];
        if (!currVal.hasOwnProperty(currPropertyName))
            return defaultVal;
        currVal = currVal[currPropertyName];
    }

    return currVal;
}

/**
 * Checks a module property for a value and reports either an error or warning
 * (depending on the value of isError) and adds the value and error or warning
 * the reportForMod object.
 * @param {Object} module The package.json structure for a module.
 * @param {String} target The property name we are looking for.
 * @param {Boolean} isError If the property is missing, this determines if it an error or warning.
 * @param {Object} reportForMod The object where the results are stored.
 */
function checkAttr(module, target, isError, reportForMod) {
    have(arguments, {module:'o', target:'s', isError:'b', reportForMod:'o'});

    var val = getPropertyVal(module, target, false);
    if (val === false) {
        var list = isError ? reportForMod.errors: reportForMod.warnings;
        list.push('package.json missing: '+target);
        return;
    }

    var key = target.replace('.', '_');
    reportForMod[key] = val;
}

/**
 * Write an object to a file. Only used for debugging.
 */
function writeToFile(fileName, data) {
    var fs = require('fs');
    var inspect = require('util').inspect;
    fs.writeFileSync(fileName, inspect(data,{depth:null}));
}
