'use strict';
require('colors');
require('sprintf.js');
var async = require('async');
var path = require('path');
var semver = require('semver');
var have = require('have');
var _ = require('lodash');
//var registry = require('npm-stats');
var NO_VERSION = 'NO_VERSION';

/**
 * Where execution starts. Uses findit to locate all the package.json files.
 * We gather all the modules in the 'modules' array.  The 'end' event fires
 * when findit finishes, then each module is processed.
 */
function main() {
    var finder = require('findit')(process.argv[2] || '.');
    var modules = [];

    finder.on('file', function (file) {
        if (path.basename(file) === 'package.json') {
            modules.push({ packageJson: path.resolve(file) });
        }
    });

    finder.on('end', function () {
        processModules(modules);
    });
}

/**
 * Perform an 'npm install & npm test' command in the appropriate directory. Calls a callback
 * when done.
 * @param {String} cwd The working directory for the `npm test` command.
 * @param {Function} cb The callback, called when done. An error indicates the tests failed.
 */
function spawnChild(cmd, args, cwd, cb) {
    have(arguments, { cmd: 'str', args: 'str array', cwd: 'str', cb: 'func'});
    var spawn = require('child_process').spawn;
    var child = spawn(cmd, args, {cwd:cwd});

   /*
    child.stdout.on('data', function (data) {
        grep.stdin.write(data);
    });

    child.stderr.on('data', function (data) {
       etconsole.log('ps stderr: ' + data);
    });
    */

    child.on('close', function (code) {
        if (code !== 0)
            return cb(new Error('exited with code: '+code));
        else
            cb();
    });
}

/**
 * Iterates through the array of modules, inspecting each module. This could
 * be done in parallel.
 * @param {Object[]} modules An array of module objects.
 */
function processModules(modules) {
    have(arguments, { modules: 'obj array' });
    var report = {};
    report.errors = [];
    report.warnings = [];

    function iter(obj, cb) {
        have(arguments, { obj: 'obj', cb: 'func' });

        var module;
        try {
            module = require(obj.packageJson);
        } catch (err) {
            report.errors.push(obj.packageJson+': could not parse file');
            console.error(obj.packageJson+': could not parse file');

            return cb();
        }

        var testable = inspectModule(module, report);
        var ver = module.version ? module.version : NO_VERSION;
        var mreport = report[module.name][ver];
        mreport.testsPassing = false;

        if (testable) {
            var cwd = path.dirname(module.packageJson);
            spawnChild('npm', ['install'], cwd, function(err) {
                if (err) return cb(err);
                spawnChild('npm', ['test'], cwd, function(err) {
                    if (err) return cb(err);
                    mreport.testsPassing = true;
                    cb();
                });
            });
        } else {
            cb();
        }
    }

    async.mapLimit(modules, 5, iter, function(err) {
        if (err) console.error(err.message);
        renderReport(report);
    });

    /*
    _.forEach(modules, function(module) {
        var testable = inspectModule(module.packageJson, report);
        if (testable) {
            npmTest(path.basedir(module.packageJson), function(err) {
            }
        }
    });
    renderReport(report);
    */
}

/**
 * Displays a report to the console, describing what has been discovered.
 * @param {Object} report An object describing each module discovered.
 */
function renderReport(report) {
    have(arguments, { report: 'obj' });

    //var util = require('util');
    //console.log(util.inspect(report, {depth:null, colors:true}));
    //var errors = report.errors;
    delete report.errors;
    //var warnings = report.warnings;
    delete report.warnings;

    _.forOwn(report, function(mData, mName) {
        if (!mData)  return;
        printf('\n%s - %s\n', mName, mData.description);
        _.forOwn(mData, function(vData, mVer) {
            if (!vData || !semver.valid(mVer)) return;

            //console.log(vData);
            var tests;
            if (vData.tests_passing) {
                tests = 'tests passing';
            } else {
                if (vData.scripts_test) {
                    tests = 'tests failing';
                } else {
                    tests = 'no tests';
                }
            }

            printf('%s %s\n', mVer, tests);
        });
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
        mreport.errors.push('package.json: version is not semver-compliant');
    }

    mreport.refCount = 1;
    if (report[module.name].refCount)
        report[module.name].refCount++;
    else
        report[module.name].refCount = 1;

    // return true if the module is testable
    return mreport.scripts_test ? true : false;
}

// start the execution
main();

