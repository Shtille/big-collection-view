/**
 * Copyright (c) 2021 Vladimir Sviridov.
 * Distributed under the MIT License (license terms are at http://opensource.org/licenses/MIT).
 * 
 * Module defines list view.
 */

/**
 * Defines list view
 */
var ListView = BigCollectionView.extend({

	containerSelectorName: '#contentData',
	elementsOffset: 0,
	estimatedItemHeight: 40,

	emptyView : null,
	
	childView : function(model){
		return ItemView;
	},

});