'use strict';

module.exports = {
    getVersion: getVersion,
    checkDepVersions: checkDepVersions
};

var have = require('have');
var _ = require('lodash');
var debug = require('debug')('flashlight');
var npm = require('npm');

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
                    if (global.g.verbose)
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
