// Trace node properties
// Useful debugging script to inspect variable bindings and node properties

console.log('Unique Variable Trace');

var myUniqueSelection = figma.currentPage.selection;

if (myUniqueSelection.length === 0) {
  console.log('No nodes selected');
  figma.notify('Please select a node');
} else {
  var myUniqueNode = myUniqueSelection[0];
  console.log('Tracing node: ' + myUniqueNode.name);
  
  try {
    var myUniqueBoundVars = myUniqueNode.boundVariables;
    if (myUniqueBoundVars) {
      console.log('boundVariables exists');
      var myUniqueKeys = Object.keys(myUniqueBoundVars);
      console.log('Found ' + myUniqueKeys.length + ' bound variables');
      
      for (var myUniqueIndex = 0; myUniqueIndex < myUniqueKeys.length; myUniqueIndex++) {
        var myUniqueProperty = myUniqueKeys[myUniqueIndex];
        var myUniqueBinding = myUniqueBoundVars[myUniqueProperty];
        console.log('Property: ' + myUniqueProperty);
        console.log('  Binding structure:', myUniqueBinding);
        console.log('  Binding type:', typeof myUniqueBinding);
        
        if (myUniqueBinding && myUniqueBinding.id) {
          console.log('  Binding ID: ' + myUniqueBinding.id);
          try {
            var myUniqueVariable = figma.variables.getVariableById(myUniqueBinding.id);
            if (myUniqueVariable && myUniqueVariable.name) {
              console.log('  Variable name: ' + myUniqueVariable.name);
              console.log('  Variable key: ' + (myUniqueVariable.key || 'no key'));
              console.log('  Variable remote: ' + (myUniqueVariable.remote || false));
            } else {
              console.log('  Variable exists but no name');
            }
          } catch (myUniqueError) {
            console.log('  Error getting variable: ' + myUniqueError.message);
          }
        } else {
          console.log('  No binding.id found');
          if (myUniqueBinding) {
            console.log('  But binding exists - checking other properties...');
            var myUniqueBindingKeys = Object.keys(myUniqueBinding);
            console.log('  Binding keys: ' + myUniqueBindingKeys.join(', '));
            
            // Check if it might be an array or different structure
            if (Array.isArray(myUniqueBinding)) {
              console.log('  Binding is an array with length: ' + myUniqueBinding.length);
              
              for (var myArrayIndex = 0; myArrayIndex < myUniqueBinding.length; myArrayIndex++) {
                var myVariableAlias = myUniqueBinding[myArrayIndex];
                console.log('  Array item ' + myArrayIndex + ':', myVariableAlias);
                
                if (myVariableAlias && myVariableAlias.id) {
                  try {
                    var myFoundVariable = figma.variables.getVariableById(myVariableAlias.id);
                    if (myFoundVariable && myFoundVariable.name) {
                      console.log('    ✅ Variable name: "' + myFoundVariable.name + '"');
                      console.log('    Variable key: ' + (myFoundVariable.key || 'no key'));
                      console.log('    Variable remote: ' + (myFoundVariable.remote || false));
                    } else {
                      console.log('    Variable exists but no name');
                    }
                  } catch (myVarError) {
                    console.log('    Error getting variable: ' + myVarError.message);
                  }
                }
              }
            }
          }
        }
      }
    } else {
      console.log('No boundVariables found');
    }
  } catch (myUniqueError) {
    console.log('Error: ' + myUniqueError.message);
  }
  
  console.log('Trace completed');
  figma.notify('Trace completed');
}
