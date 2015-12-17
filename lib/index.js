'use strict';

var O = require('ose').class(module, C);
O.package = 'ose-level';

O.content('../content');
var Entry = O.class('ose/lib/entry');
var Map = O.class('./map');

// Public {{{1
function C(name) {  // {{{2
  this.remote = O.new('ose/lib/schema/remote')();

  O.data.addSchema(name, this);

  this.maps = {};
  /**
   * Object containing maps definitions
   *
   * @property maps
   * @type Object
   */

  this.map('all', {keyEncoding: 'utf8'});

  this.map('alias', {
    field: 'alias',
    unique: true
  });
}

exports.init = function(shard, params, cb) {  // {{{2
  shard.leveldb = params.leveldb || 'memdown';

  shard.maps = {};

  // TODO: read shard configuration from shard db:
  // - lastTid
  // - lastEid
  // - shard.rev (schema revision?, update shard maps)
  // - maps drevs
  //
  // TODO: cache all if required

  return O.async.forEachOf(this.maps, function(map, key, cb) {
    map.init(shard, params, cb);  // TODO: check params, contains full shard definition
  }, function(err) {
    if (err) return cb(shard.remove(err));
    return cb();
  });
};

exports.cleanup = function(shard) {  // {{{2
  if (shard.maps) {
    for (var key in shard.maps) {
      shard.maps[key].close();
    }

    delete shard.maps;
  }
};

exports.get = function(shard, eid, cb) {  // {{{2
  if (eid in shard.cache) {
    return shard.cache[eid].awaitReady(cb);
  }

  var entry = new Entry(shard, eid);

  shard.awaitReady(function(err) {
    if (err) return cb(err);

    return shard.maps.all.get(eid, function(err, val) {
      switch (entry.subjectState) {
      case entry.SUBJECT_STATE.GONE:
        return cb(entry.goneError());
      case entry.SUBJECT_STATE.INIT:
        if (err) {
          if (err.notFound) err = O.error(shard, 'ENTRY_NOT_FOUND');
          return cb(entry.remove(err));
        }

        if (! entry.setupKind(val[0], val[1], val[2])) {
          return cb(entry.goneError());
        }

        entry.setup();
        return cb(null, entry);
      }

      throw O.log.error(shard, 'INVALID_ENTRY_STATE');
    });
  });
};

exports.query = function(shard, name, opts, cb) {  // {{{2
  var that = this;

  shard.awaitReady(function(err) {
    if (err) return cb(err);
    if (! (name in shard.maps) || ! (name in that.maps)) {
      return cb(O.error(shard, 'MAP_NOT_FOUND', 'Map was not found', name));
    }

    var map = that.maps[name];
    if (typeof map.getId !== 'function') {
      return cb(O.error(shard, 'Map has no `getId()`', name));
    }

    var filter = opts && opts.filter && map.filter;  // Map filter method

    var resp = [];
    var stream = shard.maps[name].createReadStream(opts);
    if (filter) {
      stream.on('data', function(data) {
        if (filter(data.key, data.value, opts.filter)) resp.push(map.getId(data.key, data.value));
      });
    } else {
      stream.on('data', function(data) {
        resp.push(map.getId(data.key, data.value));
      });
    }

    stream.on('end', function() {
      cb(null, resp);
    });
    stream.on('error', function(err) {
      cb(err);
    });

    return;
  });
};

exports.find = function(shard, alias, cb) {  // {{{2
  exports.findAlias(shard, alias, function(err, eid) {
    if (err) return cb(err);
    return exports.get(shard, eid, cb);
  });
};

exports.findAlias = function(shard, alias, cb) {  // {{{2
  shard.awaitReady(function(err) {
    if (err) return cb(err);

    var res;

    var stream = shard.maps.alias.createValueStream({
      gte: alias,
      lte: alias,
    });

    stream.on('data', function(val) {
      if (res) {
        cb(O.error(shard, 'DUPLICIT_ALIAS', 'Duplicit entry alias', alias));
        cb = null;
        stream.close();
        return;
      } else {
        res = val;
      }
    });
    stream.on('end', function() {
      if (cb) {
        if (res) {
          cb(null, res);
        } else {
          cb(O.error(shard, 'ENTRY_NOT_FOUND', 'Entry alias was not found', alias));
        }
        cb = null;
      }
    });
    stream.on('error', function(err) {
      if (cb) {
        cb(err);
        cb = null;
      }
    });
  });
};

exports.commit = function(trans, cb) {  // {{{2
  var shard = trans.shard;
  var maps = {};

  O.async.series([
    function(cb) {  // Mark shard busy {{{3
      shard.setBusy(cb);
    },
    function(cb) {  // Prepare data, mark entries busy {{{3
      O.async.forEachOf(trans.data, function(item, key, cb) {
        switch (item.type) {
        case 'add':
          prepAdd(item.entry);
          return cb();
        case 'del':
          prepDel(item.entry);
          return item.entry.setBusy(cb);
        case 'patch':
          item.dval = O.diff.mergeCopy(item.entry.dval, item.patch);
          prepPatch(item.entry, item.patch, item.dval);
          return item.entry.setBusy(cb);
        }

        throw O.log.error(trans, 'Invalid type in transaction item', item.type);
      }, cb);
    },
    // TODO: Save undo {{{3

    function(cb) {  // Patch entries {{{3
      O.async.forEachOf(trans.data, function(item, key, cb) {
        item.entry.drev = trans.id;

        if (item.type === 'patch') {
          item.entry.dval = item.dval;
        }

        return cb();
      }, cb);
    },
    function(cb) {  // Update maps {{{3
      O.async.forEachOf(maps, function(vals, name, cb) {
//        console.log('UPDATE MAP', name, vals);
        shard.maps[name].batch(vals, cb);
      }, cb);
    },
  ], function(err) {  // Final callback {{{3
    if (err) {
      O.log.error(err);
      return undo(cb);
    }

    for (var key in trans.data) {
      var item = trans.data[key];
      switch (item.type) {
      case 'add':
        delete item.entry._trans;
        item.entry.setup();
        break;
      case 'del':
        item.entry.remove('ENTRY_DELETED');
        break;
      case 'patch':
        item.entry.setReady();
        for (var key in item.entry.slaves) {
          O.link.send(item.entry.slaves[key], 'patch', {drev: item.entry.drev, dpatch: item.patch});
        }
        break;
      default:
        throw O.log.error(trans, 'Invalid type in transaction item', item.type);
      }
    }

    shard.setReady();

    return cb();
  });

  // }}}3

  function undo() {  // {{{3
    O.log.todo();
  }

  function add(name, val) {  // {{{3
    if (name in maps) {
      maps[name].push(val);
    } else {
      maps[name] = [val];
    }
  }

  function prepAdd(entry) {  // {{{3
    add('all', {type: 'put', key: entry.id, value: [entry.kind.name, trans.id, entry.dval]});

    for (var name in shard.schema.maps) {
      var map = shard.schema.maps[name];

      if (! map.map) continue;
//      console.log('PREP ADD', name, typeof map.kind, entry.kind.name);
      if (map.kind && map.kind !== entry.kind) continue;

      map.map(entry, function(key, val) {
        add(name, {type: 'put', key: key, value: val});
      });
    }
  }

  function prepDel(entry) {  // {{{3
    add('all', {type: 'del', key: entry.id});

    for (var name in shard.schema.maps) {
      var map = shard.schema.maps[name];

      if (! map.map) continue;
      if (map.kind && map.kind !== entry.kind) continue;

      map.map(entry, function(key, val) {
        add(name, {type: 'del', key: key});
      });
    }
  }

  function prepPatch(entry, patch, dval) {  // {{{3
    add('all', {type: 'put', key: entry.id, value: [entry.kind.name, trans.id, dval]});

    var e2 = {  // New entry mock
      id: entry.id,
      kind: entry.kind,
      shard: entry.shard,
      drev: trans.id,
      dval: dval
    };

    for (var name in shard.schema.maps) {
      var map = shard.schema.maps[name];

      if (! map.map) continue;
      if (map.kind && map.kind !== entry.kind) continue;

      if (map.onePerEntry) {
        prepPatchOne(map, entry, e2);
      } else {
        prepPatchMulti(map, entry, e2);
      }
    }
  }

  function prepPatchOne(map, entry, e2) {  // {{{3
    var key, val;

    map.map(entry, function(k, v) {
      key = k;
      val = v;
    });

    map.map(e2, function(k, v) {
      if (! k) return;

      if (k === key) {
        key = undefined;
        if (v === val) return;
      }

      add(map.name, {type: 'put', key: k, value: v});
    });

    if (key) {
      add(map.name, {type: 'del', key: key});
    }
  }

  function prepPatchMulti(map, entry, e2) {  // {{{3
    var oldMap = [];
    map.map(entry, function(key, val) {  // Build old map
      if (! key) return;  // Key must be defined

      for (var i = 0; i < oldMap.length; i++) {
        if (O._.isEqual(key, oldMap[i])) {
          oldMap[i][1] = val;  // Later emit with same key overwrites older one
          return;
        }
      }

      oldMap.push([key, val]);
      return;
    });

    var newMap = [];
    map.map(e2, function(key, val) {
      if (! key) return;  // Key must be defined

      for (var i = 0; i < oldMap.length; i++) {
        var m = oldMap[i];
        if (! m) continue;

        if (O._.isEqual(m[0], key)) {  // Key found in original map, remove from old map
          if (O._.isEqual(m[1], val)) {  // Value is same too
            oldMap[i] = null;
            return;
          }
          oldMap[i] = null;
        }
      }

      for (var i = 0; i < newMap.length; i++) {
        if (O._.isEqual(key, newMap[i])) {
          newMap[i][1] = val;  // Later emit with same key overwrites newer one
          return;
        }
      }

      newMap.push([key, val]);
      return;
    });

    for (var i = 0; i < oldMap.length; i++) {
      if (oldMap[i]) {
        add(name, {type: 'del', key: oldMap[i][0]});
      }
    }

    for (var i = 0; i < newMap.length; i++) {
      add(name, {type: 'put', key: newMap[i][0], value: newMap[i][1]});
    }
  }

  // }}}3
};

exports.map = function(name, params) {  // {{{2
  if (arguments.length === 1) {
    if (typeof name === 'object') {
      params = name;
      name = params.name;
    }
  }

  if (! name) {
    if (params.kind) {
      name = params.kind + '-';
    } else {
      name = '';
    }

    if (params.field) {
      name += params.field;
    }
  }

  var res = new Map(this, name, params);

  if (res.kind && ! res.map) {
    res.onePerEntry = true;

    if (res.field) {
      if (res.unique) {
        res.map = new Function('entry', 'cb',
          'if (entry.kind.name === "' + res.kind.name + '" && "' + res.field + '" in entry.dval) cb(entry.dval.' + res.field + ', entry.id);'
        );
        res.getId = new Function('key', 'val', 'return val');
      } else {
        res.map = new Function('entry', 'cb',
          'if (entry.kind.name === "' + res.kind.name + '" && "' + res.field + '" in entry.dval) cb([entry.dval.' + res.field + ', entry.id], null);'
        );
        res.getId = new Function('key', 'return key[1]');
      }
    } else {
      res.unique = true;
      res.map = new Function('entry', 'cb', 'if (entry.kind.name === "' + res.kind.name + '") cb(entry.id, null);');
      res.getId = new Function('key', 'return key');
    }
  }

  if (res.field && ! res.map) {
    res.onePerEntry = true;

    if (res.unique) {
      res.map = new Function('entry', 'cb', 'if ("' + res.field + '" in entry.dval) {cb(entry.dval.' + res.field + ', entry.id); }');
      res.getId = new Function('key', 'val', 'return val');
    } else {
      res.map = new Function('entry', 'cb', 'if ("' + res.field + '" in entry.dval) {cb([entry.dval.' + res.field + ', entry.id], null); }');
      res.getId = new Function('key', 'return key[1]');
    }
  }
};

