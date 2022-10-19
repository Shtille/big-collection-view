/**
 * Copyright (c) 2021 Vladimir Sviridov.
 * Distributed under the MIT License (license terms are at http://opensource.org/licenses/MIT).
 * 
 * Module defines big collection view class.
 */

/**
 * Defines big collection view class.
 * This class is made for in exchange for Marionette.CollectionView class
 * since it renders entire list, not only visible area.
 * This class got rid of those disadvatages.
 */
var BigCollectionView = Backbone.View.extend({

	initialize: function() {
		this._initialized = false;
		this._frameRequested = false;
		this._forceRedraw = false;
		this._isEmptyView = false;
		this._visibleItems = [0, 0];
		this._clientHeight = 0;
		this._views = new Map(); // (index, Item) map
		this._positionsMap = new Map(); // (index, position) map
		this._heightsMap = new Map(); // (index, height) map
		this._expandedHeightsMap = new Map(); // (index, height) map
		this._indicesCache = new LRUCache({
			capacity: 10,
			context: this,
			removeCallback: this._onIndexRemovedFromCache,
		});
		this._renderCallbackQueue = new Array();
		this._scroll = null;
		this._scrollRefreshRequested = false;
		this._isScrolling = false;
		this._scrollEndTimer = null;
		this._functionsQueue = new Array(); // render-based functions queue
		this._isFunctionActive = false; // whether function in process

		this.listenTo(this.collection, 'update', this._onCollectionChanged);
		this.listenTo(this.collection, 'reset', this._onCollectionChanged);
		this.on({
			'attach': this._onAttach.bind(this)
		});
	},

	/**
	 * Whether use IScroll plugin over default scrolling
	 */
	useIScroll: false,

	/**
	 * The name of container selector. Must be set.
	 */
	containerSelectorName: null,

	/**
	 * Offset between elements.
	 */
	elementsOffset: 1,

	/**
	 * Estimated item height.
	 */
	estimatedItemHeight: 64,

	/**
	 * Empty view class definition.
	 */
	emptyView: null,

	/**
	 * The scrollbar size changes based on the proportion between the wrapper 
	 * and the scroller width/height. Setting this to false makes the scrollbar a fixed size.
	 */
	resizeScrollbars: true,

	/**
	 * Whether enable scroll end detection.
	 */
	enableScrollEnd: false,

	/**
	 * Whether child view model stores expanded state.
	 * If true new items will count expanded state for height.
	 * Otherwise estimated height value will be used.
	 */
	modelStoresExpandedState: false,

	/**
	 * Child view class definition.
	 * 
	 * @param {Backbone.Model} model  The model.
	 */
	childView: function(model) {
		return null;
	},

	/**
	 * Requests children rendering
	 */
	render: function() {
		this._onAttach();
		this._requestFrame();
	},

	/**
	 * Forces to render all children
	 */
	refresh: function() {
		this._forceRedraw = true;
		this._requestFrame();
	},

	/**
	 * Added in compatibility with Marionette.CollectionView
	 */
	reorder: function() {
		// TODO
	},

	/**
	 * Updates all rendered nodes positions.
	 * Should be called when one child changes its size.
	 */
	updatePositions: function() {
		this._addFunctionRequest('_updatePositions');
	},

	/**
	 * Updates all rendered nodes positions.
	 * Should be called when one child changes its size.
	 * @private
	 */
	_updatePositions: function() {
		if (this.collection.length == 0)
			return;
		var position, height, view, heightOverdraft, estimatedHeight;
		estimatedHeight = this._getEstimatedElementHeightWithOffset();
		for (var index = this._visibleItems[0]; index <= this._visibleItems[1]; ++index) {
			view = this._views.get(index);
			height = this._getElementHeightWithOffset(view.$el);
			this._heightsMap.set(index, height);
			// Set expanded height items
			if (height != estimatedHeight)
				this._expandedHeightsMap.set(index, height);
			else
				this._expandedHeightsMap.delete(index);
			if (index == this._visibleItems[0]) { // first item
				position = this._obtainItemPosition(index);
			} else {
				this._positionsMap.set(index, position);
				view.$el.css('top', position);
			}
			position += height;
		}
		// Calculate summary height overdraft
		heightOverdraft = 0;
		this._expandedHeightsMap.forEach(function(value, key, map){
			heightOverdraft += value - estimatedHeight;
		}, this);
		height = this.collection.length * estimatedHeight + heightOverdraft;
		this._$content.css('height', height);
		if (this.useIScroll) {
			this._scrollRefreshRequested = true;
			this._requestFrame();
		}
	},

	/**
	 * Obtains item position by it's index.
	 * 
	 * @param {Number} index  The item index.
	 * @return {Number} Item position.
	 * @private
	 */
	_obtainItemPosition: function(index) {
		// Get previous item position and height
		var prevIndex = index - 1;
		if (this._positionsMap.has(prevIndex)) { // exists in map
			var prevPosition = this._positionsMap.get(prevIndex);
			var prevHeight = this._heightsMap.get(prevIndex);
			return prevPosition + prevHeight;
		} else { // previous doesn't exist
			// Count for expanded height overdraft
			var heightOverdraft = 0;
			var estimatedHeight = this._getEstimatedElementHeightWithOffset();
			this._expandedHeightsMap.forEach(function(value, key, map){
				if (key < index)
					heightOverdraft += value - estimatedHeight;
			}, this);
			return index * estimatedHeight + heightOverdraft;
		}
	},

	/**
	 * Manually discards expanded state by model's ID and updates positions.
	 * 
	 * @param {String} id   The model's ID.
	 */
	discardExpandedStateById: function(id) {
		this._addFunctionRequest('_discardExpandedStateById', id);
	},

	/**
	 * Implements {@link discardExpandedStateById}.
	 * 
	 * @see discardExpandedStateById
	 * @param {String} id   The model's ID.
	 * @private
	 */
	_discardExpandedStateById: function(id) {
		// We need to find model's index in collection by its ID.
		var index = this.getIndexById(id);
		if (index === null || !this._expandedHeightsMap.has(index)) {
			this._updatePositions();
			return;
		}
		this._expandedHeightsMap.delete(index);
		// Update positions of items in cache
		if (this._heightsMap.has(index)) {
			// Update this item's height
			this._heightsMap.set(index, this._getEstimatedElementHeightWithOffset());
			// Update all positions (even non-visible)
			// Since Map class stores items in insertion order we need to get the key range.
			var maxIndex = 0;
			this._positionsMap.forEach(function(value, key, map){
				maxIndex = Math.max(maxIndex, key);
			}, this);
			var position, height, view;
			for (var i = index; i <= maxIndex; ++i) {
				view = this._views.get(i);
				height = this._heightsMap.get(i);
				if (i == index) {
					position = this._positionsMap.get(i);
				} else {
					this._positionsMap.set(i, position);
					view.$el.css('top', position);
				}
				position += height;
			}
		}
		this._updatePositions();
	},

	/**
	 * Finds child view by model.
	 * 
	 * @param {Backbone.Model} model  The model.
	 * 
	 * @return {Marionette.View} Returns view by model.
	 */
	findViewByModel: function(model) {
		var view = null;
		this._views.forEach(function(value, key, map) {
			if (value.model.cid == model.cid)
				view = value;
		}, this);
		return view;
	},

	/**
	 * Checks if we are scrolling right now.
	 * 
	 * @return True if scrolling and false otherwise.
	 */
	isScrolling: function() {
		return this._isScrolling;
	},

	/**
	 * Gets item index by model's ID.
	 * 
	 * @param {String} id   The model's ID.
	 * @return {Number} The index or null if haven't found.
	 */
	getIndexById: function(id) {
		for (var i = 0; i < this.collection.length; ++i) {
			if (this.collection.at(i).get('id') == id) {
				return i;
			}
		}
		return null;
	},

	/**
	 * Scrolls to desired element with the given model ID.
	 * Complexity: O(N), where N is collection length.
	 * 
	 * @param {String} id           The model's ID.
	 * @param {Function} callback   The callback on animation complete. Optional.
	 */
	scrollToElementById: function(id, callback) {
		// We need to find model's index in collection by its ID.
		var index = this.getIndexById(id);
		this.scrollToElementByIndex(index, callback);
	},

	/**
	 * Scrolls to desired element with the given index.
	 * 
	 * @param {Integer} index       The element index.
	 * @param {Function} callback   The callback on animation complete. Optional.
	 */
	scrollToElementByIndex: function(index, callback) {
		this._addFunctionRequest('_scrollToElementByIndex', index, callback);
	},

	/**
	 * Scrolls to desired element with the given index.
	 * 
	 * @param {Integer} index       The element index.
	 * @param {Function} callback   The callback on animation complete. Optional.
	 * @private
	 */
	 _scrollToElementByIndex: function(index, callback) {
		if (index === null) return;
		var position = index * this._getEstimatedElementHeightWithOffset();
		position = this._fixScrollPosition(position);
		if (this.useIScroll) {
			this._scroll.scrollTo(0, -position);
			if (callback !== null && callback !== undefined)
				this.addRenderCompleteCallback(this, callback);
			this._requestFrame();
		} else {
			$(this.containerSelectorName).animate({
				scrollTop: position,
			}, 400, 'swing', callback);
		}
	},

	/**
	 * Fix for scrolling to the last items.
	 * 
	 * @param {Number} scrollTop  The scroll position.
	 * @return {Number} The fixed scroll position.
	 * @private
	 */
	_fixScrollPosition: function(scrollTop) {
		if (this.useIScroll) {
			if (scrollTop > Math.abs(this._scroll.maxScrollY))
				scrollTop = Math.abs(this._scroll.maxScrollY);
		} else {
			var clientHeight = this.$el[0].clientHeight;
			var scrollHeight = this.$el[0].scrollHeight;
			if (scrollTop > scrollHeight - clientHeight)
				scrollTop = Math.max(scrollHeight - clientHeight, 0);
		}
		return scrollTop;
	},

	/**
	 * Makes item fully visible by model's ID.
	 * 
	 * @param {String} id  The model's ID.
	 */
	makeItemFullyVisibleById: function(id) {
		// We need to find model's index in collection by its ID.
		var index = this.getIndexById(id);
		this.makeItemFullyVisibleByIndex(index);
	},

	/**
	 * Makes item fully visible by index.
	 * 
	 * @param {Number} index  The index of item.
	 */
	makeItemFullyVisibleByIndex: function(index) {
		this._addFunctionRequest('_makeItemFullyVisible', index);
	},

	/**
	 * Checks if item is fully visible.
	 * 
	 * @param {Number} index  The item's index.
	 * @return {Boolean} True if success and false otherwise.
	 * @private
	 */
	_isItemFullyVisible: function(index) {
		if (this._positionsMap.has(index)) {
			var clientHeight = this.$el[0].clientHeight;
			var scrollTop;
			if (this.useIScroll) {
				scrollTop = Math.abs(this._scroll.y);
			} else {
				scrollTop = this.$el[0].scrollTop;
			}
			var min = scrollTop;
			var max = scrollTop + clientHeight;
			var posMin = this._positionsMap.get(index);
			var height = this._heightsMap.get(index);
			var posMax = posMin + height;
			return min <= posMin && posMin <= max &&
				min <= posMax && posMax <= max;
		} else {
			return false;
		}
	},

	/**
	 * Makes item fully visible.
	 * 
	 * @param {Number} index  The index of item.
	 * @private
	 */
	_makeItemFullyVisible: function(index) {
		if (index === null)
			return;
		if (!this._isItemFullyVisible(index))
			this._scrollToElementByIndex(index);
	},

	/**
	 * Adds callback on render completion.
	 * 
	 * @param {Object} context      The context.
	 * @param {Function} callback   The callback. Signature is function().
	 */
	addRenderCompleteCallback: function(context, callback) {
		this._renderCallbackQueue.push({
			context: context,
			callback: callback,
		});
	},

	/**
	 * Fires all callbacks on render completion.
	 * @private
	 */
	_fireRenderCompleteCallbacks: function() {
		if (this._renderCallbackQueue.length > 0) {
			// Callback queue might be modified during callback call, thus we store the size.
			var i,n;
			n = this._renderCallbackQueue.length;
			for (i = 0; i < n; ++i) {
				var data = this._renderCallbackQueue[i];
				data.callback.call(data.context);
			}
			// Remove processed items from queue
			this._renderCallbackQueue.splice(0, n);
		}
	},

	/**
	 * Places render-dependent function call to queue.
	 * So this function guarantees that next request is served only after render is complete.
	 * @private
	 */
	_addFunctionRequest: function() {
		const args = Array.from(arguments);
		this._functionsQueue.push(args);
		this._processFunctionRequest();
	},

	/**
	 * Processes first function request in the queue.
	 * @private
	 */
	_processFunctionRequest: function() {
		if (!this._isFunctionActive && this._functionsQueue.length > 0) {
			this._isFunctionActive = true;
			// Process the request
			var request = this._functionsQueue.shift();
			var args = request.splice(1);
			this[request].apply(this, args);
			// Request frame
			this.addRenderCompleteCallback(this, this._onFunctionRequestFinished);
			this._requestFrame();
		}
	},

	/**
	 * Render complete callback upon function request.
	 * @private
	 */
	_onFunctionRequestFinished: function() {
		this._isFunctionActive = false;
		this._processFunctionRequest(); // process next request
	},

	/**
	 * On attach event listener.
	 * @private
	 */
	_onAttach: function() {
		if (this._initialized)
			return;

		this.$el = $(this.containerSelectorName);
		if (this.$el.length != 0) {
			this.$el.css({'position': 'relative', 'width': '100%'});
			this.$el.empty();

			this._$content = $('<div id="scroller">');
			this._$content.css({'position': 'absolute', 'width': '100%'});
			this.$el.append(this._$content);
			this._$content.css('height', this.collection.length * this._getEstimatedElementHeightWithOffset());

			if (this.useIScroll) {
				this._scroll = new IScroll(this.containerSelectorName, {
					probeType: 2,
					scrollbars: true,
					mouseWheel: true,
					interactiveScrollbars: true,
					shrinkScrollbars: 'clip',
					resizeScrollbars: this.resizeScrollbars,
					// fadeScrollbars: true
				});
				this._scroll.on('scroll', this._onScroll.bind(this));
			} else {
				// Use default scroll
				this.$el.scroll(this._onScroll.bind(this));
			}

			this._updateClientHeight();

			this._initialized = true;
		}
	},

	/**
	 * On collection change event listener.
	 * @private
	 */
	_onCollectionChanged: function() {
		// Full collection update
		if (!this._initialized) // this might be called during initialization phase
			return;
		this._clear();
		this._$content.css('height', this.collection.length * this._getEstimatedElementHeightWithOffset());
		this._scrollRefreshRequested = true;
		this.render();
	},

	/**
	 * On scroll event listener.
	 * @private
	 */
	_onScroll: function() {
		this._requestFrame();
		if (this.enableScrollEnd) {
			this._isScrolling = true;
			if (this._scrollEndTimer)
				clearTimeout(this._scrollEndTimer);
			this._scrollEndTimer = setTimeout(this._onScrollEnd.bind(this), 500);
		}
	},

	/**
	 * Called from timeout when scrolling has ended.
	 * Fires onScrollEnd method on all visible views.
	 * @private
	 */
	_onScrollEnd: function() {
		this._isScrolling = false;
		for (const [key, view] of this._views.entries()) {
			if (view.onScrollEnd)
				view.onScrollEnd.call(view);
		}
	},

	/**
	 * Threshold for making renderable range.
	 * @private
	 */
	_getScrollThreshold: function() {
		return this._getEstimatedElementHeightWithOffset();
	},

	/**
	 * Estimated element height with offset.
	 * @private
	 */
	_getEstimatedElementHeightWithOffset: function() {
		return this.estimatedItemHeight + this.elementsOffset;
	},

	/**
	 * Element height with offset.
	 * @private
	 * 
	 * @param {Element} el   The element to get height.
	 */
	_getElementHeightWithOffset: function(el) {
		return el.height() + this.elementsOffset;
	},

	/**
	 * Calculates optimal cache capacity.
	 * @private
	 */
	_getOptimalCacheCapacity: function() {
		var clientHeight = this._clientHeight;
		var itemHeight = this._getEstimatedElementHeightWithOffset();
		var threshold = this._getScrollThreshold();
		return Math.ceil((clientHeight + threshold * 2) / itemHeight) + 1;
	},

	/**
	 * Requests animation frame.
	 * @private
	 */
	_requestFrame: function() {
		if (!this._frameRequested) {
			window.requestAnimationFrame(this._update.bind(this));
			this._frameRequested = true;
		}
	},

	/**
	 * An animation frame logics.
	 * @private
	 */
	_update: function(delta) {
		this._frameRequested = false;
		if (this.collection.length == 0) {
			this._createEmptyView();
		} else {
			this._updateClientHeight();
			this._getVisibleItems();
			// Update visible items
			for (var index = this._visibleItems[0]; index <= this._visibleItems[1]; ++index) {
				// Refresh item by index
				if (this._indicesCache.put(index)) {
					// Index was added to cache, we need to create child view also.
					this._createItem(index);
				} else if (this._forceRedraw) {
					this._redrawItem(index);
				}
			}
		}
		if (this.useIScroll && this._scrollRefreshRequested) {
			this._scrollRefreshRequested = false;
			this._scroll.refresh();
		}
		this._forceRedraw = false;
		this._fireRenderCompleteCallbacks();
	},

	/**
	 * Updates client height and cache capacity.
	 * @private
	 */
	_updateClientHeight: function() {
		// Somehow clientHeight is being set properly after DOM creation
		var clientHeight = this.$el[0].clientHeight;
		if (this._clientHeight != clientHeight) {
			this._clientHeight = clientHeight;
			// And update cache capacity
			this._indicesCache.setCapacity(this._getOptimalCacheCapacity());
		}
		this._clientHeight = 0;
	},

	/**
	 * Calculates visible items range.
	 * @private
	 */
	_getVisibleItems: function() {
		var clientHeight = this.$el[0].clientHeight;
		var scrollTop;
		if (this.useIScroll) {
			scrollTop = Math.abs(this._scroll.y);
		} else {
			scrollTop = this.$el[0].scrollTop;
		}

		var itemHeight = this._getEstimatedElementHeightWithOffset();
		var threshold = this._getScrollThreshold();
		var min = Math.floor((scrollTop - threshold) / itemHeight);
		var max = Math.floor((scrollTop + clientHeight + threshold) / itemHeight);
		// Index of top item
		this._visibleItems[0] = Math.max(min, 0);
		// Index of bottom item
		this._visibleItems[1] = Math.min(max, this.collection.length - 1);
	},

	/**
	 * Creates empty view.
	 * @private
	 */
	_createEmptyView: function() {
		this._isEmptyView = true;
		this._clear();
		var emptyViewType = this.emptyView;
		if (emptyViewType == null)
			return;
		var view = new emptyViewType();
		// Add element to DOM
		view.render();
		this._$content.append(view.$el);
	},

	/**
	 * Creates child view.
	 * @private
	 */
	_createItem: function(index) {
		if (this._isEmptyView) {
			this._isEmptyView = false;
			this._clear();
		}
		var model = this.collection.at(index);
		var childViewType = this.childView(model);
		if (childViewType == null)
			return;
		var item = new childViewType({
			model: model,
			collectionView: this,
		});
		// Add element to DOM
		item.render();
		var position, height;
		position = this._obtainItemPosition(index);
		item.$el.css('top', position);
		this._$content.append(item.$el);
		// Add to storage
		this._views.set(index, item);
		// Store position and height
		var estimatedHeight = this._getEstimatedElementHeightWithOffset();
		if (this.modelStoresExpandedState) {
			if (this._expandedHeightsMap.has(index)) {
				height = this._expandedHeightsMap.get(index);
			} else {
				height = this._getElementHeightWithOffset(item.$el);
			}
		} else {
			height = this._getElementHeightWithOffset(item.$el);
		}
		this._positionsMap.set(index, position);
		this._heightsMap.set(index, height);
		// Set expanded height items
		if (height != estimatedHeight)
			this._expandedHeightsMap.set(index, height);
		else
			this._expandedHeightsMap.delete(index);
		// console.log('created item at ' + index);
	},

	/**
	 * Redraws child view.
	 * @private
	 */
	_redrawItem: function(index) {
		var view = this._views.get(index);
		view.render();
	},

	/**
	 * Clears all data.
	 * @private
	 */
	_clear: function() {
		this._views.clear();
		this._indicesCache.clear();
		this._positionsMap.clear();
		this._heightsMap.clear();
		this._expandedHeightsMap.clear();
		this._renderCallbackQueue.length = 0;
		// Clear DOM
		if (this._$content)
			this._$content.empty();
	},

	/**
	 * LRU cache callback on item removal.
	 * Happens when index was removed from cache.
	 * Removes item with this index from all containers.
	 * @private
	 * 
	 * @param {Integer} index   The index.
	 */
	_onIndexRemovedFromCache: function(index) {
		var view = this._views.get(index);
		// Remove element from DOM
		view.$el.remove();
		// Remove item from storage too
		this._views.delete(index);
		this._positionsMap.delete(index);
		this._heightsMap.delete(index);
		// console.log('destroyed item at ' + index);
	},
});