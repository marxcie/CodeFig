// 01 - Ultra-minimal test
// Just basic variable checking

console.log('Starting minimal test...');

var selection = figma.currentPage.selection;
console.log('Selection length:', selection.length);

if (selection.length > 0) {
  var node = selection[0];
  console.log('Node name:', node.name);
  
  if (node.boundVariables) {
    var props = Object.keys(node.boundVariables);
    console.log('Bound properties:', props.length);
    
    for (var i = 0; i < props.length; i++) {
      var prop = props[i];
      var binding = node.boundVariables[prop];
      
      if (binding && binding.id) {
        console.log('Property:', prop);
        
        var variable = figma.variables.getVariableById(binding.id);
        if (variable) {
          console.log('  Variable:', variable.name);
          console.log('  Remote:', variable.remote);
          
          if (variable.remote) {
            var collection = figma.variables.getVariableCollectionById(variable.variableCollectionId);
            if (collection) {
              console.log('  Collection:', collection.name);
              console.log('  Hidden:', collection.hiddenFromPublishing);
              
              if (collection.hiddenFromPublishing === true) {
                console.log('  ❌ BROKEN CONNECTION');
                figma.notify('❌ Broken: ' + variable.name);
              } else {
                console.log('  ✅ HEALTHY CONNECTION');
                figma.notify('✅ Healthy: ' + variable.name);
              }
            }
          }
        }
      }
    }
  }
} else {
  figma.notify('Please select an element');
}

console.log('Test complete');
