// Test Progress Indicators
// Simple script to test if progress indicators are working correctly

console.log('🧪 Testing Progress Indicators');
console.log('==============================');

// Import the core library
@import * from "@Core Library"

// Test the progress indicator system
function testProgressIndicators() {
  console.log('Starting progress indicator test...');
  
  // Create a mock selection with many nodes
  var mockNodes = [];
  for (var i = 0; i < 1000; i++) {
    mockNodes.push({
      id: 'test-' + i,
      name: 'Test Node ' + i,
      type: 'RECTANGLE'
    });
  }
  
  console.log('Created ' + mockNodes.length + ' mock nodes for testing');
  
  // Test the memory optimization system
  traverseNodesOptimized(mockNodes, function(node) {
    // Simulate some processing
    var result = {
      nodeId: node.id,
      nodeName: node.name,
      processed: true
    };
    
    // Add a small delay to simulate realistic processing
    var start = Date.now();
    while (Date.now() - start < 10) {
      // Busy wait for 10ms
    }
    
    return result;
  }, {
    operation: 'Testing Progress Indicators',
    showProgress: true,
    chunkSize: 25, // Larger chunks for better performance
    maxNodes: 1000
  }).then(function(result) {
    console.log('✅ Progress test completed successfully!');
    console.log('Processed ' + result.processed + ' nodes');
    console.log('Results: ' + result.results.length + ' items');
    
    figma.notify('✅ Progress indicator test completed successfully!');
  }).catch(function(error) {
    console.error('❌ Progress test failed:', error.message);
    figma.notify('❌ Progress indicator test failed: ' + error.message);
  });
}

// Run the test
testProgressIndicators();
