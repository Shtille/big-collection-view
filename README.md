# BigCollectionView
*BigCollectionView* is a simple Backbone-based analog of Marionette.CollectionView. But the last one renders entire collection while BigCollectionView renders only visible region.

## Getting started
1. Create model for collection item:
```javascript
var Person = Backbone.Model.extend({
    name: null,
    age: null,
});
```
2. Define underscore template for list item:
```html
<div>
    <div class='c-name'><%= name %></div>
    <div class='c-age'><%= age %></div>
</div>
```
3. Create view for list item:
```javascript
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
```
Note that element should have absolute position.

4. Inherit list view class from *BigCollectionView*:
```javascript
var ListView = BigCollectionView.extend({

    containerSelectorName: '#contentData',
    elementsOffset: 0,
    estimatedItemHeight: 40,

    emptyView : null,
    
    childView : function(model){
        return ItemView;
    },

});
```
5. Use list view with previously created collection:
```javascript
var myList = new ListView({collection: myCollection});
myList.render();
```
You can either use render() call or just simply attach this view as child view.

## License
Distributed under the MIT License (license terms are at http://opensource.org/licenses/MIT).

## Bug Reporting
Please log bugs under [Issues](https://github.com/Shtille/big-collection-view/issues) on github.

## Disclaimer
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.