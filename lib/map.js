'use strict';

var O = require('ose').class(module, C);

var Levelup = require('levelup');

function C(schema, name, params) {
  O._.extend(this, params);

  this.name = name;
  if (! this.name) throw O.log.error(schema, 'Invalid map name', params);

  this.schema = schema;
  if (this.name in schema.maps) {
    throw O.log.error(schema, 'Duplicit map name', this.name);
  }
  this.schema.maps[this.name] = this;

  if (! this.keyEncoding) this.keyEncoding = 'json';
  if (! this.valueEncoding) this.valueEncoding = 'json';

  if (typeof this.kind === 'string') {
    this.kind = schema.scope.kinds[this.kind];
  }
}

exports.init = function(shard, params, cb) {
  var res = Levelup(shard.space.name + '/' + shard.id + '-' + this.name, {
    db: require(shard.leveldb || 'memdown'),
    keyEncoding: this.keyEncoding,
    valueEncoding: this.valueEncoding,
    createIfMissing: true,
    errorIfExists: false,
  });

  shard.maps[this.name] = res;

  O.async.setImmediate(cb);
};

