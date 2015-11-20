'use strict';

var O = require('ose').class(module, C, './map');

function C(schema, kind, field, params) {
  if (! params) params = {};
  if (kind) {
    this.kind = kind;
    if (! params.name) {
      params.name = kind.name + (field ? '-' + field : '');
    }
  } else {
    if (! field) {
      throw O.log.error(this, 'INVALID_ARGS');
    }

    if (! params.name) {
      params.name = field;
    }
  }

  O.super.call(this, schema, null, params);

  this.onePerEntry = true;

  if (field) {
    this.field = field;

    if (! this.map) {
      // TODO check field for "." and expand condition

      if (this.unique) {
        this.map = new Function('entry', 'cb', 'if ("' + field + '" in entry.dval) {cb(entry.dval.' + field + ', entry.id); }');
      } else {
        this.map = new Function('entry', 'cb', 'if ("' + field + '" in entry.dval) {cb([entry.dval.' + field + ', entry.id], entry.id); }');
      }
    }
  } else {
    if (! this.map) {
      this.unique = true;
      this.map = new Function('entry', 'cb', 'if ("' + field + '" in entry.dval) {cb(entry.id, entry.id); }');
    }
  }
}

