// Create Styles from selection

console.log('=== CREATE STYLES FROM NODE NAMES ===');

// ===== CONFIGURATION =====
var simpleStyleNaming = "V4/{$layerName}";

// Style scope - what types of styles to create
// Options: "text", "color", "effect", "all"
var simpleStyleScope = "all";

// Additional options
var simpleCreateFromStaticValues = true; // Create styles even if no variable bindings

console.log('📋 Configuration:');
console.log('  Style naming:', simpleStyleNaming);
console.log('  Style scope:', simpleStyleScope);
console.log('  Create from static values:', simpleCreateFromStaticValues);

var simpleSelection = figma.currentPage.selection;

if (simpleSelection.length === 0) {
  figma.notify('Please select nodes to create styles from');
  console.log('❌ No selection found');
} else {
  console.log('🔍 Processing', simpleSelection.length, 'selected nodes...');
  
  var simpleCreatedCount = 0;
  var simpleTextCount = 0;
  var simpleColorCount = 0;
  var simpleEffectCount = 0;
  
  for (var simpleI = 0; simpleI < simpleSelection.length; simpleI++) {
    var simpleNode = simpleSelection[simpleI];
    var simpleStyleName = simpleStyleNaming.replace('{$layerName}', simpleNode.name);
    
    console.log('🎨 Processing node:', simpleNode.name, '(' + simpleNode.type + ')');
    
    // CREATE TEXT STYLES
    if ((simpleStyleScope === "text" || simpleStyleScope === "all") && simpleNode.type === "TEXT") {
      try {
        var simpleTextStyle = figma.createTextStyle();
        simpleTextStyle.name = simpleStyleName;
        var simpleTextBindings = 0;
        
        if (simpleNode.boundVariables) {
          // Copy text variable bindings
          if (simpleNode.boundVariables.fontSize && simpleNode.boundVariables.fontSize[0] && simpleNode.boundVariables.fontSize[0].id) {
            var simpleFontSizeVar = figma.variables.getVariableById(simpleNode.boundVariables.fontSize[0].id);
            if (simpleFontSizeVar) {
              simpleTextStyle.setBoundVariable('fontSize', simpleFontSizeVar);
              simpleTextBindings++;
            }
          }
          if (simpleNode.boundVariables.lineHeight && simpleNode.boundVariables.lineHeight[0] && simpleNode.boundVariables.lineHeight[0].id) {
            var simpleLineHeightVar = figma.variables.getVariableById(simpleNode.boundVariables.lineHeight[0].id);
            if (simpleLineHeightVar) {
              simpleTextStyle.setBoundVariable('lineHeight', simpleLineHeightVar);
              simpleTextBindings++;
            }
          }
          if (simpleNode.boundVariables.letterSpacing && simpleNode.boundVariables.letterSpacing[0] && simpleNode.boundVariables.letterSpacing[0].id) {
            var simpleLetterSpacingVar = figma.variables.getVariableById(simpleNode.boundVariables.letterSpacing[0].id);
            if (simpleLetterSpacingVar) {
              simpleTextStyle.setBoundVariable('letterSpacing', simpleLetterSpacingVar);
              simpleTextBindings++;
            }
          }
          if (simpleNode.boundVariables.fontWeight && simpleNode.boundVariables.fontWeight[0] && simpleNode.boundVariables.fontWeight[0].id) {
            var simpleFontWeightVar = figma.variables.getVariableById(simpleNode.boundVariables.fontWeight[0].id);
            if (simpleFontWeightVar) {
              simpleTextStyle.setBoundVariable('fontWeight', simpleFontWeightVar);
              simpleTextBindings++;
            }
          }
          if (simpleNode.boundVariables.fontFamily && simpleNode.boundVariables.fontFamily[0] && simpleNode.boundVariables.fontFamily[0].id) {
            var simpleFontFamilyVar = figma.variables.getVariableById(simpleNode.boundVariables.fontFamily[0].id);
            if (simpleFontFamilyVar) {
              simpleTextStyle.setBoundVariable('fontFamily', simpleFontFamilyVar);
              simpleTextBindings++;
            }
          }
        }
        
        if (simpleTextBindings > 0 || simpleCreateFromStaticValues) {
          if (simpleTextBindings === 0) {
            // Copy static properties as fallback
            simpleTextStyle.fontSize = simpleNode.fontSize;
            simpleTextStyle.fontName = simpleNode.fontName;
            simpleTextStyle.lineHeight = simpleNode.lineHeight;
            simpleTextStyle.letterSpacing = simpleNode.letterSpacing;
          }
          console.log('  ✅ Text style created with', simpleTextBindings, 'variable bindings');
          simpleTextCount++;
          simpleCreatedCount++;
        } else {
          simpleTextStyle.remove();
          console.log('  ⏭️ Text style skipped (no bindings, static values disabled)');
        }
      } catch (simpleTextError) {
        console.log('  ❌ Text style error:', simpleTextError.message);
      }
    }
    
    // CREATE COLOR STYLES
    if ((simpleStyleScope === "color" || simpleStyleScope === "all") && simpleNode.fills && simpleNode.fills.length > 0) {
      try {
        var simplePaintStyle = figma.createPaintStyle();
        simplePaintStyle.name = simpleStyleName;
        var simpleColorBindings = 0;
        
        // Copy fills and their variable bindings
        var simpleNewFills = [];
        for (var simpleFillI = 0; simpleFillI < simpleNode.fills.length; simpleFillI++) {
          var simpleFill = simpleNode.fills[simpleFillI];
          var simpleNewFill = {
            type: simpleFill.type,
            visible: simpleFill.visible !== false
          };
          
          if (simpleFill.type === 'SOLID') {
            simpleNewFill.color = simpleFill.color;
            simpleNewFill.opacity = simpleFill.opacity || 1;
            
            // Check for color variable binding
            if (simpleFill.boundVariables && simpleFill.boundVariables.color && simpleFill.boundVariables.color.id) {
              var simpleColorVar = figma.variables.getVariableById(simpleFill.boundVariables.color.id);
              if (simpleColorVar) {
                simpleNewFill.boundVariables = { color: { type: 'VARIABLE_ALIAS', id: simpleColorVar.id } };
                simpleColorBindings++;
              }
            }
          }
          
          simpleNewFills.push(simpleNewFill);
        }
        
        if (simpleColorBindings > 0 || simpleCreateFromStaticValues) {
          simplePaintStyle.paints = simpleNewFills;
          console.log('  ✅ Color style created with', simpleColorBindings, 'variable bindings');
          simpleColorCount++;
          simpleCreatedCount++;
        } else {
          simplePaintStyle.remove();
          console.log('  ⏭️ Color style skipped (no bindings, static values disabled)');
        }
      } catch (simpleColorError) {
        console.log('  ❌ Color style error:', simpleColorError.message);
      }
    }
    
    // CREATE EFFECT STYLES
    if ((simpleStyleScope === "effect" || simpleStyleScope === "all") && simpleNode.effects && simpleNode.effects.length > 0) {
      try {
        var simpleEffectStyle = figma.createEffectStyle();
        simpleEffectStyle.name = simpleStyleName;
        var simpleEffectBindings = 0;
        
        // Copy effects (note: effect variable bindings are more complex and less common)
        simpleEffectStyle.effects = simpleNode.effects;
        
        if (simpleCreateFromStaticValues) {
          console.log('  ✅ Effect style created with', simpleEffectBindings, 'variable bindings');
          simpleEffectCount++;
          simpleCreatedCount++;
        } else {
          simpleEffectStyle.remove();
          console.log('  ⏭️ Effect style skipped (no bindings, static values disabled)');
        }
      } catch (simpleEffectError) {
        console.log('  ❌ Effect style error:', simpleEffectError.message);
      }
    }
  }
  
  console.log('');
  console.log('=== SUMMARY ===');
  console.log('📊 Total styles created:', simpleCreatedCount);
  console.log('  📝 Text styles:', simpleTextCount);
  console.log('  🎨 Color styles:', simpleColorCount);
  console.log('  ✨ Effect styles:', simpleEffectCount);
  
  if (simpleCreatedCount > 0) {
    var simpleMessage = '✅ Created ' + simpleCreatedCount + ' styles';
    if (simpleTextCount > 0) simpleMessage += ' (' + simpleTextCount + ' text';
    if (simpleColorCount > 0) simpleMessage += ', ' + simpleColorCount + ' color';
    if (simpleEffectCount > 0) simpleMessage += ', ' + simpleEffectCount + ' effect';
    simpleMessage += ')';
    figma.notify(simpleMessage);
  } else {
    figma.notify('⚠️ No styles created');
  }
}

console.log('=== COMPLETE ===');
