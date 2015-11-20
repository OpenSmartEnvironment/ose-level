'use strict';

var O = require('ose').object(module, 'ose/lib/http/content');
exports = O.init();

/** Docs  {{{1
 * @module level
 */

/**
 * @caption Framework content
 *
 * @readme
 * Provides files of [ose] package to the browser.
 *
 * @class level.content
 * @type singleton
 * @extends ose.lib.http.content
 */

// Public {{{1

exports.addModule('node_modules/levelup/lib/levelup.js', 'levelup');
exports.addModule('node_modules/levelup/lib/batch.js');
exports.addModule('node_modules/levelup/lib/util.js');
exports.addModule('node_modules/levelup/node_modules/xtend/immutable.js', 'xtend');
exports.addModule('node_modules/levelup/node_modules/prr/prr.js', 'prr');
exports.addModule('node_modules/levelup/node_modules/level-errors/errors.js', 'level-errors');
exports.addModule('node_modules/levelup/node_modules/level-errors/node_modules/errno/errno.js', 'errno');
exports.addModule('node_modules/levelup/node_modules/level-errors/node_modules/errno/custom.js');
exports.addModule('node_modules/levelup/node_modules/level-iterator-stream/index.js', 'level-iterator-stream');
exports.addModule('node_modules/levelup/node_modules/deferred-leveldown/deferred-leveldown.js', 'deferred-leveldown');
exports.addModule('node_modules/levelup/node_modules/deferred-leveldown/deferred-iterator.js');
exports.addModule('node_modules/levelup/node_modules/deferred-leveldown/node_modules/abstract-leveldown/index.js', 'abstract-leveldown');
exports.addModule('node_modules/levelup/node_modules/deferred-leveldown/node_modules/abstract-leveldown/abstract-leveldown.js');
exports.addModule('node_modules/levelup/node_modules/deferred-leveldown/node_modules/abstract-leveldown/abstract-chained-batch.js');
exports.addModule('node_modules/levelup/node_modules/deferred-leveldown/node_modules/abstract-leveldown/abstract-iterator.js');
exports.addModule('node_modules/levelup/node_modules/deferred-leveldown/node_modules/abstract-leveldown/is-leveldown.js');
exports.addModule('node_modules/levelup/node_modules/level-codec/index.js', 'level-codec');
exports.addModule('node_modules/levelup/node_modules/level-codec/lib/encodings.js');
exports.addModule('node_modules/levelup/node_modules/semver/semver.js', 'semver');

exports.addModule('node_modules/memdown/memdown.js', 'memdown');
exports.addModule('node_modules/memdown/node_modules/functional-red-black-tree/rbtree.js', 'functional-red-black-tree');
exports.addModule('node_modules/memdown/node_modules/ltgt/index.js', 'ltgt');

exports.addModule('lib/index');
exports.addModule('lib/map');
exports.addModule('lib/field');

