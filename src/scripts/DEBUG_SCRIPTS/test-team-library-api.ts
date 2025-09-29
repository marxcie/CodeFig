// Test Team Library API methods
// Diagnostic script to check available Team Library API methods

console.log('🔍 Testing Team Library API availability...');

console.log('figma.teamLibrary object:', typeof figma.teamLibrary);

if (figma.teamLibrary) {
  console.log('Available methods on figma.teamLibrary:');
  var methods = Object.getOwnPropertyNames(figma.teamLibrary);
  for (var i = 0; i < methods.length; i++) {
    console.log('  - ' + methods[i] + ': ' + typeof figma.teamLibrary[methods[i]]);
  }
  
  // Test specific methods we're trying to use
  console.log('');
  console.log('Method availability check:');
  console.log('  getAvailableLibraryStyleCollectionsAsync:', typeof figma.teamLibrary.getAvailableLibraryStyleCollectionsAsync);
  console.log('  getStylesInLibraryCollectionAsync:', typeof figma.teamLibrary.getStylesInLibraryCollectionAsync);
  console.log('  getAvailableLibraryVariableCollectionsAsync:', typeof figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync);
  console.log('  getVariablesInLibraryCollectionAsync:', typeof figma.teamLibrary.getVariablesInLibraryCollectionAsync);
} else {
  console.log('❌ figma.teamLibrary is not available');
}

console.log('');
console.log('Other style-related API methods:');
console.log('  figma.importStyleByKeyAsync:', typeof figma.importStyleByKeyAsync);
console.log('  figma.getLocalTextStyles:', typeof figma.getLocalTextStyles);
console.log('  figma.getLocalPaintStyles:', typeof figma.getLocalPaintStyles);
console.log('  figma.getLocalEffectStyles:', typeof figma.getLocalEffectStyles);

