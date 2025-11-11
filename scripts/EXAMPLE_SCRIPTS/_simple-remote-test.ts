// 03 - Simple Remote Connection Test
// Lightweight version to avoid memory issues
// @import { displayResults, createResult } from "@InfoPanel"

console.log('=== SIMPLE REMOTE CONNECTION TEST ===');

var selection = figma.currentPage.selection;
if (selection.length === 0) {
  figma.notify('Please select an element with a remote variable');
  console.log('No selection - exiting');
} else {
  var node = selection[0];
  console.log('Testing node:', node.name);
  
  if (!node.boundVariables) {
    figma.notify('Selected element has no variable bindings');
    console.log('No bound variables - exiting');
  } else {
    var properties = Object.keys(node.boundVariables);
    console.log('Properties with bindings:', properties.length);
    
    var results = [];
    
    for (var i = 0; i < properties.length; i++) {
      var property = properties[i];
      var binding = node.boundVariables[property];
      
      // Handle array bindings
      var actualBinding = Array.isArray(binding) ? binding[0] : binding;
      
      if (actualBinding && actualBinding.id) {
        console.log('Testing property:', property);
        
        try {
          var variable = figma.variables.getVariableById(actualBinding.id);
          
          if (variable && variable.remote) {
            console.log('  Variable:', variable.name, '(remote)');
            
            var collection = figma.variables.getVariableCollectionById(variable.variableCollectionId);
            
            if (collection) {
              console.log('  Collection:', collection.name);
              console.log('  Hidden from publishing:', collection.hiddenFromPublishing);
              
              var status = 'Unknown';
              var isHealthy = true;
              
              if (collection.hiddenFromPublishing === true) {
                status = 'DISCONNECTED (hidden from publishing)';
                isHealthy = false;
              } else {
                status = 'CONNECTED (visible for publishing)';
                isHealthy = true;
              }
              
              console.log('  Status:', status);
              
              results.push(createResult(
                variable.name + ' (' + property + ')',
                status + ' • Collection: ' + collection.name,
                isHealthy ? 'info' : 'error'
              ));
              
            } else {
              console.log('  Collection: NOT FOUND');
              results.push(createResult(
                variable.name + ' (' + property + ')',
                'Collection not accessible',
                'error'
              ));
            }
          } else if (variable) {
            console.log('  Variable:', variable.name, '(local)');
          } else {
            console.log('  Variable: NOT FOUND');
            results.push(createResult(
              'Unknown Variable (' + property + ')',
              'Variable not found',
              'error'
            ));
          }
        } catch (error) {
          console.log('  Error:', error.message);
          results.push(createResult(
            'Error (' + property + ')',
            'Test failed: ' + error.message,
            'error'
          ));
        }
      }
    }
    
    if (results.length > 0) {
      displayResults({
        title: 'Remote Connection Test Results',
        results: results,
        type: 'info'
      });
    } else {
      figma.notify('No remote variables found');
    }
  }
}

console.log('Simple remote connection test complete');
