// Editable Imports Demo
// Shows how you can edit @import statements in the app

// Try editing these imports in the app!
// Add or remove functions from the list:
@import { getAllStyles, distance } from "@Core Library"

// You can also import from other scripts:
// @import { add, average } from "@Math Helpers"

console.log('✏️ Editable Imports Demo');
console.log('');

console.log('📝 You can edit the @import statements above!');
console.log('   • Add more functions: @import { getAllStyles, distance, center }');
console.log('   • Remove functions: @import { getAllStyles }');  
console.log('   • Import from other scripts: @import { add } from "My Math Helpers"');
console.log('');

// Use the imported functions
var selection = figma.currentPage.selection;

if (selection.length === 0) {
  console.log('📋 Using imported getAllStyles function:');
  var styles = getAllStyles();
  console.log('Found ' + styles.length + ' local styles');
  
  console.log('');
  console.log('💡 Try selecting 2 elements and run again to see distance calculation!');
  
} else if (selection.length >= 2) {
  console.log('📏 Using imported distance function:');
  
  var node1 = selection[0];
  var node2 = selection[1];
  
  if ('x' in node1 && 'y' in node1 && 'x' in node2 && 'y' in node2) {
    var point1 = { x: node1.x + node1.width/2, y: node1.y + node1.height/2 };
    var point2 = { x: node2.x + node2.width/2, y: node2.y + node2.height/2 };
    
    var dist = distance(point1, point2);
    console.log('Distance between centers: ' + Math.round(dist) + 'px');
  }
  
} else {
  console.log('📋 Select 2+ elements to see distance calculation');
}

console.log('');
console.log('✅ Edit the @import line above to try different functions!');
console.log('🎯 Available functions: getAllStyles, distance, center, bounds, traverseNodes');
console.log('📚 Or import from: "@Math Helpers", "@Custom Helpers"');

figma.notify('✏️ Edit the @import statements and run again!');
