var count = 20;
var myCollection = new Backbone.Collection(), p;
for (var i = 0; i < count; ++i) {
	p = new Person();
	p.set('name', 'vasya'+i);
	p.set('age', i);
	myCollection.add(p, {at:i});
}

var myList = new ListView({collection: myCollection});
myList.render();