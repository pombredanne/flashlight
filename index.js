#!/usr/bin/env node
/**
 * @fileOverview
 * This is the entry point for flashlight. At the bottom of this file is the
 * statement: "main(argv);" which starts execution. The code discovers all the
 * dependencies by reading all the package.json files. Each dependency is check
 * and, at the end of main() a report is produced.
 *
 * Each module is tested to see if:
 *  - engine.node is satisfied by current node version.
 *  - module has a:
 *      - scripts.test, error if missing
 *      - version, error if missing
 *      - repository.url, warning if missing
 *      - bugs.url, warning if missing
 *      - homepage, warning if missing
 *      - license, warning if missing
 *  - version is semver compliant, error if not
 *  - tests run successfully with 'npm test', error if not
 *  - the version is the latest from NPM, warning if not
 *
 * Right now, there is no check to see if a dependency is in the package.json
 * but not in the source.
 */
'use strict';

// for testing
exports.exports = {
    getLatestVersions: getLatestVersions,
    runTests: runTests,
    testModule: testModule,
    createTestArray: createTestArray,
    inspectModule: inspectModule,
};

require('sprintf.js');
var async = require('async');
var path = require('path');
var semver = require('semver');
var have = require('have');
var _ = require('lodash');
var is = require('is2');
var debug = require('debug')('flashlight');
var packageDeps = require('package-deps');
var assert = require('assert');
var argv = require('optimist').argv;
var misc = require('./lib/misc');
var verUtil = require('./lib/version');

var NO_VERSION = 'NO VERSION';  // constant for when we don't have a version

// globals to store command-line switches
var g = global.g = {
    parallel: 5,
    verbose: false,
    warnings: false,
    path: process.cwd(),
    testOutput: false,
    showLicense: false,
    showAll: false,
    depth: undefined

};

/**
 * Where execution starts. Uses package-deps to locate all the package.json
 * files. We gather all the modules in testArray. Then, we get the latest
 * and run the tests. At the conclusion, we run the tests.
 * @param {Object} argv The command line arguments from Optimist.
 */
function main(argv) {
    have(arguments, { argv: 'obj' });

    misc.cmdLineArgs(argv, g);
    var report = {};
    var testArray = [];

    if (g.verbose)
        console.log('Finding the dependencies.');
    console.log('depth:',g.depth);
    var deps = packageDeps.findAll('./', 1);
    createTestArray(deps, testArray);

    if (testArray.length < 1) {
        console.error('Did not find any modules to test, exiting.');
        process.exit(0);
    }

    console.log('Found %s modules to inspect and test.', testArray.length);
    console.log('Doing "npm install" and "npm test" for each module. ');

    if (g.verbose && testArray.length > g.parallel && testArray.length > 2 &&
        g.parallel > 1) {
        console.log('Processing %s, doing %s modules in parallel.',
                    testArray.length, g.parallel);
    }

    // do 2 things in order:
    // 1- get latest version for each module
    // 2- run the tests for each module
    // After both of the above are done, a report is written to stdout
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
 * Iterates through the array of dependencies to create a flat array with 1
 * entry for every module.
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
 * Get the latest version for each discovered module using NPM's API.
 * @param {Object[]} testArray an array of objects describing the modules to test
 * @param {Number} parallel The amount of concurrent tasks in mapSeriesLimit
 * @param {Function} cb The callback when the function is complete.
 */
function getLatestVersions(testArray, parallel, cb) {
    console.log('typeof testArray', typeof testArray);
    have(arguments, { testArry: 'obj', parallel: 'num', cb: 'func' });

    console.log('Getting latest version information from npmjs.org.');
    async.mapLimit(testArray, parallel, verUtil.getVersion, function(err) {
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
    async.mapLimit(testArray, parallel, async.apply(testModule, report),
        function(err) {
            if (err) debug(err.message);
            cb();
        }
    );
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
        misc.checkAttr(module, item.attr, item.err, mreport);
    });

    verUtil.checkDepVersions(module, 'dependencies', mreport);
    verUtil.checkDepVersions(module, 'devDependencies', mreport);

    // additional checking
    if (ver === NO_VERSION) mreport.version = NO_VERSION;
    if (mreport.version !== NO_VERSION && !semver.valid(mreport.version)) {
        mreport.errors.push('package.json: version is not semver-compliant: '+
                            mreport.version);
    }

    mreport.refCount = 1;
    if (report[module.name].refCount)
        report[module.name].refCount++;
    else
        report[module.name].refCount = 1;

    // return true if the module is testable
    return mreport.scripts_test ? true : false;
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
    mreport.depChain.push(misc.depChainFromPath(obj.packageJson));
    if (!mreport.latest && obj.latest) {
        mreport.latest = obj.latest;
        if (semver.gt(mreport.latest, ver)) {
            mreport.warnings.push('version '+ver+
                                  ' is outdated, the latest version is: '+
                                  mreport.latest);
        }
    }

    if (testable) {
        debug('testing '+module.name+' ('+ver+')');
        if (g.verbose)
            console.log('Starting "npm install '+module.name+'"');
        var cwd = path.dirname(obj.packageJson);
        misc.spawnChild('npm', ['install'], cwd, function(err) {
            if (err) { return cb(err); }
            debug('completed "npm install '+module.name+'"');
            if (g.verbose) {
                console.log('Completed "npm install '+module.name+'"');
                console.log('Starting "npm test '+module.name+'"');
            }
            misc.spawnChild('npm', ['test'], cwd, function(err) {
                if (err) {
                    if (g.verbose)
                        console.error('Tests for '+module.name+' '+err.message);
                    return cb();
                }
                if (g.verbose)
                    console.log('Completed "npm install '+module.name+'"');
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
 * Displays a report to the console, describing what has been discovered.
 * @param {Object} report An object describing each module discovered.
 */
function renderReport(report) {
    have(arguments, { report: 'obj' });

    misc.writeToFile('./report.js', report);

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
                if (vData.depChain.length === 1) {
                    mReport.push(sprintf('    Dependency chain: '+
                                         vData.depChain[i]+'\n'));
                } else {
                    mReport.push(sprintf('    Dependency chain %2d: '+
                                         vData.depChain[i]+'\n', i+1));
                }
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

// start the execution
main(argv);

