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
		this._indicesCache = new LRUCache({
			capacity: 10,
			context: this,
			removeCallback: this._onIndexRemovedFromCache,
		});
		this._renderCallbackQueue = new Array();
		this._scroll = null;

		this.listenTo(this.collection, 'update', this._onCollectionChanged);
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
		if (this.collection.length == 0)
			return;
		var position, height, view;
		for (var index = this._visibleItems[0]; index <= this._visibleItems[1]; ++index) {
			view = this._views.get(index);
			height = this._getElementHeightWithOffset(view.$el);
			this._heightsMap.set(index, height);
			if (index == this._visibleItems[0]) { // first item
				position = this._positionsMap.get(index);
			} else {
				this._positionsMap.set(index, position);
				view.$el.css('top', position);
			}
			position += height;
		}
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
	 * Scrolls to desired element with the given model ID.
	 * Complexity: O(N), where N is collection length.
	 * 
	 * @param {String} id           The model's ID.
	 * @param {Function} callback   The callback on animation complete. Optional.
	 */
	scrollToElementById: function(id, callback) {
		// We need to find model's index in collection by its ID.
		var index = null;
		for (var i = 0; i < this.collection.length; ++i) {
			if (this.collection.at(i).get('id') == id) {
				index = i;
				break;
			}
		}
		this.scrollToElementByIndex(index, callback);
	},

	/**
	 * Scrolls to desired element with the given index.
	 * 
	 * @param {Integer} index       The element index.
	 * @param {Function} callback   The callback on animation complete. Optional.
	 */
	scrollToElementByIndex: function(index, callback) {
		if (!index) return;
		var position = index * this._getEstimatedElementHeightWithOffset();
		if (this.useIScroll) {
			this._scroll.scrollTo(0, -position);
			this._requestFrame();
			if (callback !== null && callback !== undefined)
				callback.call(this);
		} else {
			$(this.containerSelectorName).animate({
				scrollTop: position,
			}, 400, 'swing', callback);
		}
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
		while (this._renderCallbackQueue.length > 0) {
			var data = this._renderCallbackQueue.pop();
			data.callback.call(data.context);
		}
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
					shrinkScrollbars: 'scale',
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
		this.render();
	},

	/**
	 * On scroll event listener.
	 * @private
	 */
	_onScroll: function() {
		this._requestFrame();
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
			var scrollTop = this.useIScroll ? (-this._scroll.y) : this.$el[0].scrollTop;
			this._getVisibleItems(scrollTop, this.$el[0].scrollHeight, this.$el[0].clientHeight);
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
	_getVisibleItems: function(scrollTop, scrollHeight, clientHeight) {
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
		});
		// Add element to DOM
		item.render();
		// Get previous item position and height
		var prevIndex = index - 1;
		var position;
		if (this._positionsMap.has(prevIndex)) { // exists in map
			var prevPosition = this._positionsMap.get(prevIndex);
			var prevHeight = this._heightsMap.get(prevIndex);
			position = prevPosition + prevHeight;
		} else { // doesn't exist
			position = index * this._getEstimatedElementHeightWithOffset();
		}
		var height = this._getEstimatedElementHeightWithOffset();
		this._positionsMap.set(index, position);
		this._heightsMap.set(index, height);
		item.$el.css('top', position);
		this._$content.append(item.$el);
		// Add to storage
		this._views.set(index, item);
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