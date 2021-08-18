/**
 * Copyright (c) 2021 Vladimir Sviridov.
 * Distributed under the MIT License (license terms are at http://opensource.org/licenses/MIT).
 * 
 * Module defines view for one item.
 */

/**
 * Defines view for one item
 */
var ItemView = Backbone.View.extend({
	template: _.template( $('.person').text() ),

	initialize: function() {
		this.model.bind('change', this.render, this);
	},

	render: function() {
		this.$el = $(this.template(this.model.toJSON()));
		this.$el.css({'position': 'absolute', 'width': '100%'});
		
		return this;
	},

});