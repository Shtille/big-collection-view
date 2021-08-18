/**
 * Copyright (c) 2021 Vladimir Sviridov.
 * Distributed under the MIT License (license terms are at http://opensource.org/licenses/MIT).
 * 
 * Module defines LRU cache class.
 */

/**
 * Defines LRU cache
 * 
 * @param {Object} options  The options. Possible options:
 *      - {Integer} capacity         The capacity of cache.
 *      - {Object} context           The context for callback.
 *      - {Function} removeCallback  The callback that is being called on item removal.
 *                                   Signature is function(element).
 */
function LRUCache(options) {
	var _capacity = options.capacity || 10;
	var _context = options.context;
	var _removeCallback = options.removeCallback;
	var _set = new Set();
	var _array = new Array();

	/**
	 * Adds data to cache and removes old data to keep capacity.
	 * 
	 * @param {Object} value   The value to be added.
	 * 
	 * @return {Boolean} Returns false if value exists and true otherwise.
	 */
	this.put = function(value) {
		if (_set.has(value)) {
			// Move element to the front of array
			var index = _array.indexOf(value);
			_array.splice(index, 1);
			_array.splice(0, 0, value);
			return false;
		} else {
			_array.splice(0, 0, value);
			_set.add(value);
		}
		if (_array.length > _capacity) {
			var removed = _array.splice(_capacity);
			removed.forEach(function (element) {
				_set.delete(element);
				if (_removeCallback)
					_removeCallback.call(_context, element);
			});
		}
		return true;
	};

	/**
	 * Clears cache
	 */
	this.clear = function() {
		_array.splice(0, _array.length);
		_set.clear();
	};

	/**
	 * Checks if cache has this value
	 * 
	 * @param {Object} value   The value.
	 * 
	 * @return {Boolean} Returns true if exists and false otherwise.
	 */
	this.has = function(value) {
		return _set.has(value);
	};

	/**
	 * Returns capacity
	 * 
	 * @return {Integer} Returns capacity.
	 */
	this.capacity = function() {
		return _capacity;
	};

	/**
	 * Sets new capacity
	 * 
	 * @param {Integer} value   The value.
	 */
	this.setCapacity = function(value) {
		_capacity = value;
	};

	/**
	 * Returns minimum value
	 * 
	 * @return {Object} Returns minimum value.
	 */
	this.minimum = function() {
		var min = null;
		for (var i = 0; i < _array.length; ++i) {
			if (min == null || _array[i] < min)
				min = _array[i];
		}
		return min;
	};
};