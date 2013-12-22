'use strict';
require('colors');
var path = require('path');
var semver = require('semver');
var have = require('have');
var _ = require('lodash');
//var registry = require('npm-stats');

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
            //console.log(file);
            modules.push({
                dir: path.dirname(file),
                packageJson: path.resolve(file)
            });
        }
    });

    finder.on('end', function () {
        processModules(modules);
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

    _.forEach(modules, function(module) {
        inspectModule(module.dir, module.packageJson, report);
    });
    renderReport(report);
}

/**
 * Displays a report to the console, describing what has been discovered.
 * @param {Object} report An object describing each module discovered.
 */
function renderReport(report) {
    have(arguments, { report: 'obj' });
    var util = require('util');
    console.log(util.inspect(report, {depth:null, colors:true}));
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
    //console.log(target, ':', val);
}

/**
 * Inspect each module, flagging any issues.
 * @param {String} dirName The directory path where the module is.
 * @param {String} packageJson The absolute path to package.json file.
 * @param {Object} report The object where results are stored.
 */
function inspectModule(dirName, packageJson, report) {
    have(arguments, {dirName: 'str', packageJson: 'str', report: 'obj'});

    var module = require(packageJson);
    if (!module) return;
    if (!module.name)  return;

    if (report[module.name] && report[module.name][module.version]) {
        report[module.name].refCount++;
        report[module.name][module.version].refCount++;
        return;
    }

    // handle case if no version

    if (!report[module.name]) report[module.name] = {};

    var mreport = report[module.name][module.version] = {};
    mreport.errors = [];
    mreport.warnings = [];

    //console.log('\nname:', module.name);
    //console.log('dir:', dirName);

    var toDo = [
        { attr: 'description', err: false },
        { attr: 'version', err: true },
        { attr: 'scripts.test', err: true },
        { attr: 'engine.node', err: false },
        { attr: 'repository.url', err: false },
        { attr: 'bugs.url', err: false },
    ];

    _.forEach(toDo, function(item) {
        checkAttr(module, item.attr, item.err, mreport);
    });

    // additional checking
    if (mreport.version && !semver.valid(mreport.version)) {
        mreport.errors.push('package.json: version is not semver-compliant');
    }

    mreport.refCount = 1;
    if (report[module.name].refCount)
        report[module.name].refCount++;
    else
        report[module.name].refCount = 1;
}

main();

