/*
 * mocha's bdd syntax is inspired in RSpec
 *   please read: http://betterspecs.org/
 */
require('./util/globals');

describe('jsondiffpatch', function() {
  before(function() {});
  it('has a semver version', function() {
    expect(jsondiffpatch.version).to.match(/^\d+\.\d+\.\d+(-.*)?$/);
  });
});

var DiffPatcher = jsondiffpatch.DiffPatcher;

var isArray = (typeof Array.isArray === 'function') ?
  // use native function
  Array.isArray :
  // use instanceof operator
  function(a) {
    return typeof a === 'object' && a instanceof Array;
  };

var deepEqual = function(obj1, obj2) {
  if (obj1 === obj2) {
    return true;
  }
  if (obj1 === null || obj2 === null) {
    return false;
  }
  if ((typeof obj1 === 'object') && (typeof obj2 === 'object')) {
    if (obj1 instanceof Date) {
      if (!(obj2 instanceof Date)) {
        return false;
      }
      return obj1.toString() === obj2.toString();
    }
    if (isArray(obj1)) {
      if (!isArray(obj2)) {
        return false;
      }
      if (obj1.length !== obj2.length) {
        return false;
      }
      var length = obj1.length;
      for (var i = 0; i < length; i++) {
        if (!deepEqual(obj1[i], obj2[i])) {
          return false;
        }
      }
      return true;
    } else {
      if (isArray(obj2)) {
        return false;
      }
    }
    var name;
    for (name in obj2) {
      if (!Object.prototype.hasOwnProperty.call(obj1, name)) {
        return false;
      }
    }
    for (name in obj1) {
      if (!Object.prototype.hasOwnProperty.call(obj2, name) || !deepEqual(obj1[name], obj2[name])) {
        return false;
      }
    }
    return true;
  }
  return false;
};

expect.Assertion.prototype.deepEqual = function(obj) {
  this.assert(
    deepEqual(this.obj, obj),
    function() {
      return 'expected ' + JSON.stringify(this.obj) + ' to be ' + JSON.stringify(obj);
    },
    function() {
      return 'expected ' + JSON.stringify(this.obj) + ' not to be ' + JSON.stringify(obj);
    });
  return this;
};

var valueDescription = function(value) {
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'boolean') {
    return value.toString();
  }
  if (value instanceof Date) {
    return 'Date';
  }
  if (value instanceof RegExp) {
    return 'RegExp';
  }
  if (isArray(value)) {
    return 'array';
  }
  if (typeof value === 'string') {
    if (value.length >= 60) {
      return 'large text';
    }
  }
  return typeof value;
};

// Object.keys polyfill
var objectKeys = (typeof Object.keys === 'function') ?
  function(obj) {
    return Object.keys(obj);
  } :
  function(obj) {
    var keys = [];
    for (var key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        keys.push(key);
      }
    }
    return keys;
  };

// Array.prototype.forEach polyfill
var arrayForEach = (typeof Array.prototype.forEach === 'function') ?
  function(array, fn) {
    return array.forEach(fn);
  } :
  function(array, fn) {
    for (var index = 0, length = array.length; index < length; index++) {
      fn(array[index], index, array);
    }
  };

describe('DiffPatcher', function() {
  var examples = require('./examples/diffpatch');
  arrayForEach(objectKeys(examples), function(groupName) {
    var group = examples[groupName];
    describe(groupName, function() {
      arrayForEach(group, function(example) {
        if (!example) {
          return;
        }
        var name = example.name || valueDescription(example.left) + ' -> ' + valueDescription(example.right);
        describe(name, function() {
          before(function() {
            this.instance = new DiffPatcher(example.options);
          });
          if (example.error) {
            it('diff should fail with: ' + example.error, function() {
              var instance = this.instance;
              expect(function() {
                instance.diff(example.left, example.right);
              }).to.throwException(example.error);
            });
            return;
          }
          it('can diff', function() {
            var delta = this.instance.diff(example.left, example.right);
            expect(delta).to.be.deepEqual(example.delta);
          });
          it('can diff backwards', function() {
            var reverse = this.instance.diff(example.right, example.left);
            expect(reverse).to.be.deepEqual(example.reverse);
          });
          if (!example.noPatch) {
            it('can patch', function() {
              var right = this.instance.patch(jsondiffpatch.clone(example.left), example.delta);
              expect(right).to.be.deepEqual(example.right);
            });
            it('can reverse delta', function() {
              var reverse = this.instance.reverse(example.delta);
              if (example.exactReverse !== false) {
                expect(reverse).to.be.deepEqual(example.reverse);
              } else {
                // reversed delta and the swapped-diff delta are not always equal,
                // to verify they're equivalent, patch and compare the results
                expect(this.instance.patch(jsondiffpatch.clone(example.right), reverse)).to.be.deepEqual(example.left);
                reverse = this.instance.diff(example.right, example.left);
                expect(this.instance.patch(jsondiffpatch.clone(example.right), reverse)).to.be.deepEqual(example.left);
              }
            });
            it('can unpatch', function() {
              var left = this.instance.unpatch(jsondiffpatch.clone(example.right), example.delta);
              expect(left).to.be.deepEqual(example.left);
            });
          }
        });
      });
    });
  });

  describe('.clone', function() {
    it('clones complex objects', function() {
      var obj = {
        name: 'a string',
        nested: {
          attributes: [
            { name: 'one', value: 345, since: new Date(1934, 1, 1) }
          ],
          another: 'property',
          enabled: true,
          nested2: {
            name: 'another string'
          }
        }
      };
      var cloned = jsondiffpatch.clone(obj);
      expect(cloned).to.be.deepEqual(obj);
    });
    it('clones RegExp', function() {
      var obj = {
        pattern: /expr/gim
      };
      var cloned = jsondiffpatch.clone(obj);
      expect(cloned).to.be.deepEqual({
        pattern: /expr/gim
      });
    });
  });

  describe('using cloneDiffValues', function(){
    before(function() {
      this.instance = new DiffPatcher({
        cloneDiffValues: true
      });
    });
    it('ensures deltas don\'t reference original objects', function(){
      var left = {
        oldProp: {
          value: 3
        }
      };
      var right = {
        newProp: {
          value: 5
        }
      };
      var delta = this.instance.diff(left, right);
      left.oldProp.value = 1;
      right.newProp.value = 8;
      expect(delta).to.be.deepEqual({
        oldProp: [{ value: 3 }, 0, 0],
        newProp: [{ value: 5}]
      });
    });
  });

  describe('static shortcuts', function(){
    it('diff', function(){
      var delta = jsondiffpatch.diff(4, 5);
      expect(delta).to.be.deepEqual([4, 5]);
    });
    it('patch', function(){
      var right = jsondiffpatch.patch(4, [4, 5]);
      expect(right).to.be(5);
    });
    it('unpatch', function(){
      var left = jsondiffpatch.unpatch(5, [4, 5]);
      expect(left).to.be(4);
    });
    it('reverse', function(){
      var reverseDelta = jsondiffpatch.reverse([4, 5]);
      expect(reverseDelta).to.be.deepEqual([5, 4]);
    });
  });

  describe('plugins', function() {
    before(function() {
      this.instance = new DiffPatcher();
    });

    describe('getting pipe filter list', function(){
      it('returns builtin filters', function(){
        expect(this.instance.processor.pipes.diff.list()).to.be.deepEqual([
          'collectChildren', 'trivial', 'dates', 'texts', 'objects', 'arrays'
        ]);
      });
    });

    describe('supporting numeric deltas', function(){

      var NUMERIC_DIFFERENCE = -8;

      it('diff', function() {
        // a constant to identify the custom delta type
        function numericDiffFilter(context) {
          if (typeof context.left === 'number' && typeof context.right === 'number') {
            // store number delta, eg. useful for distributed counters
            context.setResult([0, context.right - context.left, NUMERIC_DIFFERENCE]).exit();
          }
        }
        // a filterName is useful if I want to allow other filters to be inserted before/after this one
        numericDiffFilter.filterName = 'numeric';

        // insert new filter, right before trivial one
        this.instance.processor.pipes.diff.before('trivial', numericDiffFilter);

        var delta = this.instance.diff({ population: 400 }, { population: 403 });
        expect(delta).to.be.deepEqual({ population: [0, 3, NUMERIC_DIFFERENCE] });
      });

      it('patch', function() {
        function numericPatchFilter(context) {
          if (context.delta && Array.isArray(context.delta) && context.delta[2] === NUMERIC_DIFFERENCE) {
            context.setResult(context.left + context.delta[1]).exit();
          }
        }
        numericPatchFilter.filterName = 'numeric';
        this.instance.processor.pipes.patch.before('trivial', numericPatchFilter);

        var delta = { population: [0, 3, NUMERIC_DIFFERENCE] };
        var right = this.instance.patch({ population: 600 }, delta);
        expect(right).to.be.deepEqual({ population: 603 });
      });

      it('unpatch', function() {
        function numericReverseFilter(context) {
          if (context.nested) { return; }
          if (context.delta && Array.isArray(context.delta) && context.delta[2] === NUMERIC_DIFFERENCE) {
            context.setResult([0, -context.delta[1], NUMERIC_DIFFERENCE]).exit();
          }
        }
        numericReverseFilter.filterName = 'numeric';
        this.instance.processor.pipes.reverse.after('trivial', numericReverseFilter);

        var delta = { population: [0, 3, NUMERIC_DIFFERENCE] };
        var reverseDelta = this.instance.reverse(delta);
        expect(reverseDelta).to.be.deepEqual({ population: [0, -3, NUMERIC_DIFFERENCE] });
        var right = { population: 703 };
        this.instance.unpatch(right, delta);
        expect(right).to.be.deepEqual({ population: 700 });
      });

    });

  });
});
