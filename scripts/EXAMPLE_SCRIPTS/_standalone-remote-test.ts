// 02 - Standalone Remote Connection Test
// No imports - completely self-contained to avoid conflicts

console.log('=== STANDALONE REMOTE CONNECTION TEST ===');

var selection = figma.currentPage.selection;
if (selection.length === 0) {
  figma.notify('Please select an element with a remote variable');
  console.log('❌ No selection - please select an element first');
} else {
  var node = selection[0];
  console.log('🔍 Testing node:', node.name);
  
  if (!node.boundVariables) {
    figma.notify('Selected element has no variable bindings');
    console.log('❌ No bound variables found');
  } else {
    var properties = Object.keys(node.boundVariables);
    console.log('📋 Properties with bindings:', properties.length);
    
    var remoteVariablesFound = 0;
    var brokenConnections = 0;
    
    for (var i = 0; i < properties.length; i++) {
      var property = properties[i];
      var binding = node.boundVariables[property];
      
      // Handle array bindings
      var actualBinding = Array.isArray(binding) ? binding[0] : binding;
      
      if (actualBinding && actualBinding.id) {
        console.log('');
        console.log('🔍 Testing property:', property);
        
        try {
          var variable = figma.variables.getVariableById(actualBinding.id);
          
          if (variable && variable.remote) {
            remoteVariablesFound++;
            console.log('  📡 Variable:', variable.name, '(REMOTE)');
            
            var collection = figma.variables.getVariableCollectionById(variable.variableCollectionId);
            
            if (collection) {
              console.log('  📚 Collection:', collection.name);
              console.log('  🔒 Hidden from publishing:', collection.hiddenFromPublishing);
              
              if (collection.hiddenFromPublishing === true) {
                console.log('  ❌ STATUS: DISCONNECTED (hidden from publishing)');
                brokenConnections++;
                figma.notify('🚨 Found broken connection: ' + variable.name);
              } else {
                console.log('  ✅ STATUS: CONNECTED (visible for publishing)');
              }
              
            } else {
              console.log('  ❌ Collection: NOT ACCESSIBLE');
              brokenConnections++;
              figma.notify('🚨 Collection not accessible: ' + variable.name);
            }
          } else if (variable) {
            console.log('  🏠 Variable:', variable.name, '(LOCAL - skipping)');
          } else {
            console.log('  ❌ Variable: NOT FOUND');
          }
        } catch (error) {
          console.log('  ❌ Error testing variable:', error.message);
        }
      }
    }
    
    console.log('');
    console.log('=== SUMMARY ===');
    console.log('📡 Remote variables found:', remoteVariablesFound);
    console.log('❌ Broken connections:', brokenConnections);
    console.log('✅ Healthy connections:', remoteVariablesFound - brokenConnections);
    
    if (remoteVariablesFound === 0) {
      figma.notify('No remote variables found in selection');
    } else if (brokenConnections === 0) {
      figma.notify('✅ All ' + remoteVariablesFound + ' remote variables are healthy!');
    } else {
      figma.notify('🚨 Found ' + brokenConnections + ' broken out of ' + remoteVariablesFound + ' remote variables');
    }
  }
}

console.log('Standalone remote connection test complete');
