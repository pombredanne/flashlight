#!/usr/bin/env node
'use strict';
require('colors');
require('sprintf.js');
var async = require('async');
var path = require('path');
var semver = require('semver');
var have = require('have');
var _ = require('lodash');
var is = require('is2');
var NO_VERSION = 'NO_VERSION';
var debug = require('debug')('flashlight');
var packageDeps = require('package-deps');
var assert = require('assert');
var npm = require('npm');
var argv = require('optimist').argv;
var fs = require('fs');

// globals to store command-line switches
var g = {
    parallel: 5,
    verbose: false,
    warnings: false,
    path: process.cwd(),
    testOutput: false,
    showLicense: false,
    showAll: false
};

/**
 * Where execution starts. Uses package-deps to locate all the package.json
 * files. We gather all the modules in testArray. Then, we get the latest
 * and run the tests. At the conclusion, we run the tests.
 * @param {Object} argv The command line arguments from Optimist.
 */
function main(argv) {
    have(arguments, { argv: 'obj' });

    cmdLineArgs(argv);
    var report = {};
    var testArray = [];

    if (g.verbose)
        console.log('Finding the dependencies.');
    var deps = packageDeps.findAll('./');
    if (g.verbose)
        console.log('Dependencies found. Creating list of modules to inspect and test.');
    createTestArray(deps, testArray);

    if (testArray.length < 1) {
        console.error('Did not find any modules to test, exiting.');
        process.exit(0);
    }

    console.log('Found %s modules to inspect and test.', testArray.length);
    console.log('Doing "npm install" and "npm test" for each module. ');

    if (g.verbose && testArray.length > g.parallel && testArray.length > 2 && g.parallel > 1) {
        console.log('Processing %s, doing %s modules in parallel.',
                    testArray.length, g.parallel);
    }

    // do 2 things in order:
    // 1- latest version for each module
    // 2- run the tests for each module
    async.series([
        async.apply(getLatestVersions, testArray, g.parallel),
        async.apply(runTests, testArray, g.parallel, report)
    ],
    // after series is done, this callback runs
    function(err) {
        if (err) debug(err.message);
        renderReport(report);
    });
}

/**
 * Handle the command line arguments, by setting the correct globals.
 * @param {Object} The command-line arguments from optimist.
 */
function cmdLineArgs(argv) {
    have(arguments, { argv: 'obj' });

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
 * Get the latest version for each discovered module using NPM's API.
 * @param {Object[]} testArray an array of objects describing the modules to test
 * @param {Number} parallel The amount of concurrent tasks in mapSeriesLimit
 * @param {Function} cb The callback when the function is complete.
 */
function getLatestVersions(testArray, parallel, cb) {
    console.log('typeof testArray', typeof testArray);
    have(arguments, { testArry: 'obj', parallel: 'num', cb: 'func' });

    function getVersion(obj, cb) {
        have(arguments, { obj: 'obj', cb: 'func' });

        if (!obj || !obj.name)  return cb();
        npm.load({ loglevel: 'silent' }, function (err) {
            if (npm && npm.registry && npm.registry.log && npm.registry.log.level)
                npm.registry.log.level = 'silent';
            if (err) return cb(err);
            var silent = true;      // make npm not chatty on stdout
            npm.commands.view([obj.name], silent, function (err, data) {
                if (err) { return cb(err); }
                for (var key in data) {
                    if (!data.hasOwnProperty(key)) continue;
                    if (data[key] && data[key].versions && data[key].versions.length) {
                        var len = data[key].versions.length;
                        obj.latest = data[key].versions[len-1];
                        if (g.verbose)
                            console.log('Latest version for '+obj.name+': '+obj.latest);
                        return cb();
                    }
                }
                debug('getLatestVersions: No version found');
                obj.latest = '?.?.?';
                return cb();
            });
        });
    }

    console.log('Getting latest version information from npmjs.org.');
    async.mapLimit(testArray, parallel, getVersion, function(err) {
        if (err) debug(err.message);
        cb();
    });
}

/**
 * Runs the tests using mapLimit with the number of concurrent tasks specified 
 * in the parallel parameter.
 * @param {Object[]} testArray an array of objects describing the modules to test
 * @param {Number} parallel The amount of concurrent tasks in mapSeriesLimit
 * @param {Object} report An object containing the results of the testing/inspection
 * @param {Function} cb The callback when the function is complete.
 */
function runTests(testArray, parallel, report, cb) {
    have(arguments, {
        testArry: 'obj',
        parallel: 'num',
        report: 'obj',
        cb: 'func'
    });

    console.log('Running "npm install" and "npm test" for each module.');
    async.mapLimit(testArray, parallel, async.apply(testModule, report), function(err) {
        if (err) debug(err.message);
        cb();
    });
}

/**
 * Perform a command in the appropriate directory. Calls a callback when done.
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
        if (g.testOutput) process.stdout.write(data);
    });

    child.stderr.on('data', function (data) {
        if (g.testOutput) process.stderr.write(data);
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
 * Will test the module and place the result in the report object.
 * @param {Object} report An object to hold the results for later display
 * @param {Object} obj An object with the module information to test (from testArray)
 * @param {Function} cb The callback.
 */
function testModule(report, obj, cb) {
    have(arguments, { report: 'obj', obj: 'obj', cb: 'func' });

    var module;
    try {
        module = require(obj.packageJson);
    } catch (err) {
        report.errors.push(obj.packageJson+': could not parse file');
        return cb();
    }

    var testable = inspectModule(module, report);
    var ver = module.version ? module.version : NO_VERSION;
    var mreport = report[module.name][ver];
    mreport.testsPassing = false;
    if (!mreport.depChain)  mreport.depChain = [];
    mreport.depChain.push(depChainFromPath(obj.packageJson));
    if (!mreport.latest && obj.latest) {
        mreport.latest = obj.latest;
        if (semver.gt(mreport.latest, ver)) {
            mreport.warnings.push('version '+ver+' is outdated, the latest version is: '+mreport.latest);
        }
    }

    if (testable) {
        debug('testing '+module.name+' ('+ver+')');
        if (g.verbose)
            console.log('Starting "npm install '+module.name+'"');
        var cwd = path.dirname(obj.packageJson);
        spawnChild('npm', ['install'], cwd, function(err) {
            if (err) { return cb(err); }
            debug('completed "npm install '+module.name+'"');
            if (g.verbose)
                console.log('Starting "npm test '+module.name+'"');
            spawnChild('npm', ['test'], cwd, function(err) {
                if (err) {
                    if (g.verbose) console.error('Tests for '+module.name+': '+err.message);
                    return cb();
                }
                debug('completed "npm test '+module.name+'"');
                mreport.testsPassing = true;
                cb();
            });
        });
    } else {
        cb();
    }
}

/**
 * Iterates through the array of modules, inspecting each module.
 * @param {Object[]} moduleTree An array of module objects for reporting.
 * @param {Object[]} testArray An array of module objects for testing.
 */
function createTestArray(moduleTree, testArray) {
    have(arguments, { moduleTree: 'obj', report: 'obj' });
    assert.ok(is.array(testArray));

    if (!moduleTree.packageJson)  return;

    testArray.push({
        packageJson: moduleTree.packageJson,
        ver: moduleTree.ver,
        name: moduleTree.name
    });

    for (var modName in moduleTree.dependencies) {
        if (!moduleTree[modName] || !moduleTree[modName].packageJson) return;
        var ver = moduleTree.dependencies[modName];
        moduleTree[modName].ver = ver;
        moduleTree[modName].name = modName;
        createTestArray(moduleTree[modName], testArray);
    }
}

/**
 * Displays a report to the console, describing what has been discovered.
 * @param {Object} report An object describing each module discovered.
 */
function renderReport(report) {
    have(arguments, { report: 'obj' });

    writeToFile('./report.js', report);

    for (var mName in report) {
        if (!report.hasOwnProperty(mName)) continue;
        if (mName === 'errors' || mName === 'warnings')  continue;
        var mData = report[mName];
        if (!mData)  return;
        var mReport = [];
        var doReport = g.showAll ? true : false;
        var i;

        var title = sprintf('\n%s - %s\n', mName, mData.description);

        for (var mVer in mData) {
            if (!mData.hasOwnProperty(mVer)) continue;
            if (!semver.valid(mVer)) continue;

            var vData = mData[mVer];
            if (!vData) continue;

            if (g.showLicense) {
                if (vData.license)
                    mReport.push('License: '+vData.license);
                else
                    mReport.push('License: Unavailable');
            }
            mReport.push(sprintf('Version %s:\n', mVer));

            var tests;
            if (!vData.testsPassing) {
                if (vData.scripts_test &&vData.scripts_test !== 'echo "Error: '+
                    'no test specified" && exit 1') {
                    tests = 'tests are failing';
                } else {
                    tests = 'there are no tests';
                }
                doReport = true;
                vData.errors.push(tests);
            }

            for (i=0; i<vData.depChain.length; i++) {
                if (vData.depChain.length === 1)
                    mReport.push(sprintf('    Dependency chain: '+vData.depChain[i]+'\n'));
                else
                    mReport.push(sprintf('    Dependency chain %2d: '+vData.depChain[i]+'\n', i+1));
            }

            for (i=0; i<vData.errors.length; i++) {
                mReport.push('    error: '+vData.errors[i]+'\n');
                doReport = true;
            }

            for (i=0; g.warnings && i<vData.warnings.length; i++) {
                mReport.push('    warning: '+vData.warnings[i]+'\n');
                doReport = true;
            }
        }
        if (doReport && mReport.length > 1) {
            mReport.unshift(title);
            for (i=0; i<mReport.length; i++) {
                process.stdout.write(mReport[i]);
            }
        }
    }
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
 * Check dependencies for wildcard versions.
 */
function checkDepVersions(module, property, mreport) {
    have(arguments, {module: 'obj', property: 'str', mreport: 'obj'});
    if (!module[property])  return;

    _.forOwn(module[property], function(key, val) {
        if (val === '' || val === '*')
            mreport.errors.push(property+' for '+key+'\'s version is a wildcard');
        else if (val.match(/^>(.)+/) !== null)
            mreport.errors.push(property+' for '+key+'\'s version is '+val);
        else if (val.match(/^<(.)+/) !== null)
            mreport.warning.push(property+' for '+key+'\'s version is '+val);
        else if (val.match(/^~(.)+/) !== null)
            mreport.warning.push(property+' for '+key+'\'s version is '+val);
    });
}

/**
 * Inspect each module, flagging any issues.
 * @param {obj} module The object of the package.json file.
 * @param {Object} report The object where results are stored.
 * @return {Boolean} true, if the module can be tested, false otherwise
 */
function inspectModule(module, report) {
    have(arguments, {module: 'obj', report: 'obj'});

    if (!module) return false;
    if (!module.name)  return false;

    if (report[module.name] && report[module.name][module.version]) {
        report[module.name].refCount++;
        report[module.name][module.version].refCount++;
        // we've seen this module before, don't test
        return false;
    }

    // handle case if no version
    var ver = module.version ? module.version : NO_VERSION;
    if (!report[module.name]) report[module.name] = {};

    var mreport = report[module.name][ver] = {};
    mreport.errors = [];
    mreport.warnings = [];
    if (module.engine && module.engine.node && !mreport.engine_node) {
        mreport.engine_node = module.engine.node;
        if (!semver.satisfies(process.version, mreport.engine_node)) {
            mreport.errors.push('version of Node.js ('+process.version+
                                ') does not satisfy engine.node: '+
                                mreport.engine_node);
        }
    }

    // Any attribute you are interested in, place here
    // it will be put in module by checkDepVersions
    var toDo = [
        { attr: 'scripts.test', err: true },
        { attr: 'version', err: true },
        { attr: 'repository.url', err: false },
        { attr: 'bugs.url', err: false },
        { attr: 'homepage', err: false },
        { attr: 'license', err: false },
    ];

    if (!report[module.name].description && module.description)
        report[module.name].description = module.description;

    _.forEach(toDo, function(item) {
        checkAttr(module, item.attr, item.err, mreport);
    });

    checkDepVersions(module, 'dependencies', mreport);
    checkDepVersions(module, 'devDependencies', mreport);

    var util = require('util');
    // additional checking
    if (ver === NO_VERSION) mreport.version = NO_VERSION;
    if (mreport.version !== NO_VERSION && !semver.valid(mreport.version)) {
        mreport.errors.push('package.json: version is not semver-compliant: '+mreport.version);
    }

    mreport.refCount = 1;
    if (report[module.name].refCount)
        report[module.name].refCount++;
    else
        report[module.name].refCount = 1;

    // return true if the module is testable
    return mreport.scripts_test ? true : false;
}

function writeToFile(fileName, data) {
    var fs = require('fs');
    var inspect = require('util').inspect;
    fs.writeFileSync(fileName, inspect(data,{depth:null}));
}

// start the execution
main(argv);

