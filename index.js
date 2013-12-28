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
//var util = require('util');
var assert = require('assert');
var npm = require('npm');

/**
 * Where execution starts. Uses findit to locate all the package.json files.
 * We gather all the modules in the 'modules' array.  The 'end' event fires
 * when findit finishes, then each module is processed.
 */
function main() {
    var report = {};
    var testArray = [];

    console.log('Finding the dependencies.');
    var deps = packageDeps.findAll('./');
    console.log('Dependencies found. Creating list of modules to inspect and test.');
    createTestArray(deps, testArray);
    var parallel = 5;

    if (testArray.length < 1) {
        console.log('Did not find any modules to test, exiting.');
        process.exit(0);
    }
    console.log('Found %s modules to inspect and test.', testArray.length);

    console.log('Doing "npm install" and "npm test" for each module. ');
    if (testArray.length > parallel && testArray.length > 2 && parallel > 1) {
        console.log('Processing %s, doing %s modules in parallel.',
                    testArray.length, parallel);
    }

    async.series([
        // get latest version for each module
        async.apply(getLatestVersions, testArray, parallel),
        // run the tests for each module
        async.apply(runTests, testArray, parallel, report)
    ],
    // after series is done, this callback runs
    function(err) {
        if (err) debug(err.message);
        renderReport(report);
    });

}

function getLatestVersions(testArray, parallel, cb) {
    function getVersion(obj, cb) {
        if (!obj || !obj.name)  return cb();
        npm.load({ loglevel: 'silent' }, function (err) {
            if (err) return cb(err);
            var silent = true;      // make npm not chatty on stdout
            npm.commands.view([obj.name], silent, function (err, data) {
                if (err) { return cb(err); }
                for (var key in data) {
                    if (!data.hasOwnProperty(key)) continue;
                    if (data[key] && data[key].versions && data[key].versions.length) {
                        var len = data[key].versions.length;
                        obj.latest = data[key].versions[len-1];
                        return cb();
                    }
                }
                debug('getLatestVersions: No version found');
                obj.latest = '?.?.?';
                return cb();
            });
        });
    }

    async.mapLimit(testArray, parallel, getVersion, function(err) {
        if (err) debug(err.message);
        cb();
    });
}

function runTests(testArray, parallel, report, cb) {
    async.mapLimit(testArray, parallel, async.apply(testModule, report), function(err) {
        if (err) debug(err.message);
        cb();
    });
}

/**
 * Perform a command in the appropriate directory. Calls a callback when done.
 * @param {String} cwd The working directory for the `npm test` command.
 * @param {Function} cb The callback, called when done. An error indicates the tests failed.
 */
function spawnChild(cmd, args, cwd, cb) {
    have(arguments, { cmd: 'str', args: 'str array', cwd: 'str', cb: 'func'});

    var spawn = require('child_process').spawn;
    var child = spawn(cmd, args, {cwd:cwd});

    child.stdout.on('data', function (data) {
        //debug('stdout: '+data.toString().white);
    });

    child.stderr.on('data', function (data) {
        //debug('stderr: '+data.toString().red);
    });

    child.on('close', function (code) {
        if (code !== 0)
            return cb(new Error('exited with code: '+code));
        else
            cb();
    });
}

/**
 * Using the path to discovered package.json, parse the implied module
 * dependendcy chain.
 * @param {String} Qualified path to package.json
 * @return {String} Describing the implied module dependency chain
 */
function depChainFromPath(pathToPkgJson) {
    have(arguments, { pathToPkgJson: 'str' });
    //pathToPkgJson = path.relative(pathToPkgJson, process.cwd());
    pathToPkgJson = pathToPkgJson.replace(path.join(process.cwd(),'..'), '');
    pathToPkgJson = pathToPkgJson.replace(/\/package\.json$/, '');
    pathToPkgJson = pathToPkgJson.replace(/node_modules/g, '');
    pathToPkgJson = pathToPkgJson.split(path.sep);
    pathToPkgJson = pathToPkgJson.filter(function(s) { return is.nonEmptyStr(s); });
    pathToPkgJson = pathToPkgJson.join(' > ');
    return pathToPkgJson;
}

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
    mreport.depChain = [];
    mreport.depChain.push(depChainFromPath(obj.packageJson));

    if (testable) {
        debug('testing '+module.name+' ('+ver+')');
        //debug('module.packageJson:',module.packageJson);
        var cwd = path.dirname(obj.packageJson);
        spawnChild('npm', ['install'], cwd, function(err) {
            if (err) { return cb(err); }
            spawnChild('npm', ['test'], cwd, function(err) {
                if (err) { return cb(); }
                mreport.testsPassing = true;
                cb();
            });
        });
    } else {
        cb();
    }
}

/**
 * Iterates through the array of modules, inspecting each module. This could
 * be done in parallel.
 * @param {Object[]} modules An array of module objects.
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

    // FIXME: Check if still need errors and warnings here
    delete report.errors;
    delete report.warnings;
    writeToFile('./report.js', report);

    //_.forOwn(report, function(mData, mName) {
    for (var mName in report) {
        if (!report.hasOwnProperty(mName)) continue;
        var mData = report[mName];
        if (!mData)  return;
        if (mName === 'errors' || mName === 'warnings')  continue;
        var mReport = [];

        mReport.push(sprintf('\n%s - %s\n', mName, mData.description));

        //_.forOwn(mData, function(vData, mVer) {
        for (var mVer in mData) {
            if (!mData.hasOwnProperty(mVer)) continue;
            var vData = mData[mVer];
            if (!vData) continue;
            debug('vData:',vData);

            var tests;
            if (vData.testsPassing) {
                tests = 'tests passing';
            } else {
                if (vData.scripts_test &&vData.scripts_test !== 'echo "Error: '+
                    'no test specified" && exit 1') {
                    tests = 'tests failing';
                } else {
                    tests = 'no tests';
                }
                mReport.push(sprintf('%s %s\n', mVer, tests));
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

    var toDo = [
        { attr: 'scripts.test', err: true },
        { attr: 'engine.node', err: false },
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
main();

