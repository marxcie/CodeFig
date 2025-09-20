// Debug logging functions to remove source references
function debugLog(message: string, ...args: any[]) {
  const log = console.log.bind(console);
  setTimeout(() => log('%cCodeFig: ' + message, 'color: #0066cc; font-weight: bold;', ...args), 0);
}

function debugError(message: string, ...args: any[]) {
  const error = console.error.bind(console);
  setTimeout(() => error('%cCodeFig: ' + message, 'color: #cc0000; font-weight: bold;', ...args), 0);
}

// Show the UI
figma.showUI(__html__, { 
  width: 1000, 
  height: 600,
  themeColors: true
  // Note: resizable is not in the official Figma API types but works in practice
} as any);

// Handle messages from the UI
figma.ui.onmessage = (msg) => {
  debugLog('Backend: Received message type:', msg.type);
  if (msg.type === 'LIST') {
    // Get saved scripts and last opened script from client storage
    Promise.all([
      figma.clientStorage.getAsync('userScripts'),
      figma.clientStorage.getAsync('lastOpenedScript')
    ]).then(([scripts, lastOpenedScript]) => {
      figma.ui.postMessage({
        type: 'LIST',
        items: scripts || [],
        lastOpenedScript: lastOpenedScript || null
      });
    });
  }

    if (msg.type === 'SAVE') {
      // Save a script
      debugLog('Backend: Received SAVE request for:', msg.name);
      debugLog('Backend: SAVE request data:', {
        name: msg.name,
        codeLength: msg.code ? msg.code.length : 'undefined',
        codePreview: msg.code ? msg.code.substring(0, 50) + '...' : 'undefined',
        type: msg.type
      });
      
      figma.clientStorage.getAsync('userScripts').then((scripts) => {
        const userScripts = scripts || [];
        
        // If oldName is provided, look for the script by oldName (for renames)
        // Otherwise, look for the script by current name
        const searchName = msg.oldName || msg.name;
        const existingIndex = userScripts.findIndex((s: any) => s.name === searchName);
        
        const scriptData = {
          name: msg.name,
          code: msg.code,
          type: 'user'
        };

        if (existingIndex >= 0) {
          userScripts[existingIndex] = scriptData;
          debugLog('Backend: Updated existing script' + (msg.oldName ? ` (renamed from ${msg.oldName} to ${msg.name})` : ''));
        } else {
          userScripts.push(scriptData);
          debugLog('Backend: Added new script');
        }

        debugLog('Backend: Saving to storage...');
        
        figma.clientStorage.setAsync('userScripts', userScripts).then(() => {
          debugLog('Backend: Save successful, sending confirmation');
          // Confirm save completed
          figma.ui.postMessage({
            type: 'SAVE_CONFIRMED',
            scriptData: scriptData
          });
        }).catch((error) => {
          debugError('Backend: Save failed:', error);
          figma.ui.postMessage({
            type: 'SAVE_FAILED',
            error: error.message,
            scriptName: msg.name
          });
        });
      }).catch((error) => {
        debugError('Backend: Failed to load user scripts:', error);
        figma.ui.postMessage({
          type: 'SAVE_FAILED',
          error: error.message,
          scriptName: msg.name
        });
      });
    }

  if (msg.type === 'DELETE') {
    // Delete a script
    figma.clientStorage.getAsync('userScripts').then((scripts) => {
      const userScripts = scripts || [];
      const filteredScripts = userScripts.filter((s: any) => s.name !== msg.name);
      figma.clientStorage.setAsync('userScripts', filteredScripts);
    });
  }

  if (msg.type === 'RUN') {
    // Execute the script code (now supports TypeScript directly!)
    const codeToExecute = msg.code;
    let jsCode: string = codeToExecute;
    
    try {
      // Dual Engine Approach - detect language and use appropriate conversion
      const languageDirective = codeToExecute.match(/\/\/\s*@lang:\s*(js|javascript|ts|typescript)/i);
      const noConvertDirective = /\/\/\s*@ts-convert:\s*false/i.test(codeToExecute);
      const forceConvertDirective = /\/\/\s*@ts-convert:\s*true/i.test(codeToExecute);
      
      // Determine the script language
      let scriptLanguage = 'auto';
      if (languageDirective) {
        scriptLanguage = languageDirective[1].toLowerCase();
        if (scriptLanguage === 'javascript') scriptLanguage = 'js';
        if (scriptLanguage === 'typescript') scriptLanguage = 'ts';
      }
      
      // Auto-detect if no directive specified
      if (scriptLanguage === 'auto') {
        const hasTypeScriptFeatures = /:\s*\w+\s*[=,;)]|interface\s+|enum\s+|<\w+>/.test(codeToExecute);
        scriptLanguage = hasTypeScriptFeatures ? 'ts' : 'js';
      }
      
      debugLog(`Backend: Detected script language: ${scriptLanguage}`);
      
      // Determine if we should convert
      const shouldConvert = !noConvertDirective && (forceConvertDirective || scriptLanguage === 'ts');
      
      if (shouldConvert) {
        if (scriptLanguage === 'ts') {
          debugLog('Backend: Using TypeScript conversion engine');
          jsCode = convertTypeScriptToJavaScript(jsCode);
        } else {
          debugLog('Backend: Using basic JavaScript conversion engine');
          jsCode = convertBasicFeatures(jsCode);
        }
        
        debugLog('Backend: Applied simple TypeScript conversion');
        debugLog('Backend: Converted code length: ' + jsCode.length);
        debugLog('Backend: First 500 chars of converted code: ' + jsCode.substring(0, 500));
        
        // Debug problematic lines around common error locations
        const debugLines = jsCode.split('\n');
        if (debugLines.length > 25) {
          debugLog('Backend: Lines 20-30 of converted code:');
          for (let i = 19; i < Math.min(30, debugLines.length); i++) {
            debugLog(`Backend: Line ${i + 1}: ${debugLines[i]}`);
          }
        }
      } else {
          debugLog('Backend: No TypeScript transformations needed');
        }
        
        // Skip additional transformations to avoid breaking object literals
      
      // Create a custom console object that uses our debugLog function
      const scriptConsole = {
        log: (...args: any[]) => {
          const message = args.map(arg => 
            typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
          ).join(' ');
          debugLog('Script:', message);
        },
        error: (...args: any[]) => {
          const message = args.map(arg => 
            typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
          ).join(' ');
          debugError('Script:', message);
        }
      };

      // Create a function that has access to Figma API
      // Add common Figma API shortcuts for convenience
      const scriptFunction = new Function(
        'figma',
        'console',
        `
        // Convenience shortcuts - make selection and currentPage available
        const selection = figma.currentPage.selection;
        const currentPage = figma.currentPage;
        
        // User code
        ${jsCode}
        `
      );
      
      debugLog('Backend: About to execute script function');
      debugLog('Backend: Script code preview:', jsCode.substring(0, 200) + '...');
      
      // Pass both figma and our custom console
      scriptFunction(figma, scriptConsole);
      debugLog('Backend: Script function completed successfully');
      
      figma.notify('Done! 😁');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      figma.notify(`Script error: ${errorMessage} 😳`, { error: true });
      debugError('Backend: Script execution error:', error);
      debugError('Backend: Error message:', errorMessage);
      if (error instanceof Error && error.stack) {
        debugError('Backend: Error stack:', error.stack);
      }
      debugError('Backend: Original code length:', msg.code.length);
      if (typeof jsCode !== 'undefined') {
        debugError('Backend: Converted code length:', jsCode.length);
        debugError('Backend: First 500 chars of converted code:', jsCode.substring(0, 500));
      } else {
        debugError('Backend: jsCode was undefined - no TypeScript conversion applied');
      }
    }
  }

  if (msg.type === 'NOTIFY') {
    // Show notification
    figma.notify(msg.message);
  }

  if (msg.type === 'SET_LAST_OPENED') {
    // Store the last opened script
    figma.clientStorage.setAsync('lastOpenedScript', {
      name: msg.name,
      type: msg.scriptType
    });
  }
};

// Conversion Engine 1: Basic JavaScript features (const/let, simple template literals)
function convertBasicFeatures(code: string): string {
  let jsCode = code;
  
  // Convert const/let to var
  jsCode = jsCode.replace(/\bconst\b/g, 'var');
  jsCode = jsCode.replace(/\blet\b/g, 'var');
  
  // Convert simple template literals without variables
  jsCode = jsCode.replace(/`([^`${}]*)`/g, '"$1"');
  
  // Convert simple template literals with one variable
  jsCode = jsCode.replace(/`([^`]*?)\$\{([^}]+)\}([^`]*?)`/g, '"$1" + ($2) + "$3"');
  
  return jsCode;
}

// Conversion Engine 2: Full TypeScript to JavaScript conversion
function convertTypeScriptToJavaScript(code: string): string {
  let jsCode = code;
  
  // 1. Convert const/let to var
  jsCode = jsCode.replace(/\bconst\b/g, 'var');
  jsCode = jsCode.replace(/\blet\b/g, 'var');
  
  // 2. Remove type annotations from variable declarations
  // Match: var name: Type = value  ->  var name = value
  jsCode = jsCode.replace(/(\bvar\s+\w+)\s*:\s*[^=,;)]+(\s*[=,;)])/g, '$1$2');
  
  // 3. Remove type annotations from function parameters
  // Match: (param: Type, other: Type)  ->  (param, other)
  jsCode = jsCode.replace(/\(([^)]*)\)/g, (match, params) => {
    if (!params.includes(':')) return match;
    const cleanParams = params.replace(/(\w+)\s*:\s*[^,)]+/g, '$1');
    return `(${cleanParams})`;
  });
  
  // 4. Remove return type annotations from functions
  // Match: function name(): Type {  ->  function name() {
  jsCode = jsCode.replace(/\)\s*:\s*[^{]+\s*\{/g, ') {');
  
  // 5. Convert arrow functions to regular functions (simple cases)
  // Match: var name = () => {  ->  var name = function() {
  jsCode = jsCode.replace(/(\bvar\s+\w+)\s*=\s*\([^)]*\)\s*=>\s*\{/g, '$1 = function() {');
  
  // 6. Convert template literals
  jsCode = jsCode.replace(/`([^`${}]*)`/g, '"$1"');
  jsCode = jsCode.replace(/`([^`]*?)\$\{([^}]+)\}([^`]*?)`/g, '"$1" + ($2) + "$3"');
  
  // 7. Convert for-of loops to traditional for loops
  jsCode = jsCode.replace(/for\s*\(\s*var\s+(\w+)\s+of\s+(\w+)\s*\)\s*\{/g, 
    'for (var $1Index = 0; $1Index < $2.length; $1Index++) {\n  var $1 = $2[$1Index];');
  
  // 8. Remove non-null assertions (!)
  jsCode = jsCode.replace(/(\w+)!/g, '$1');
  
  // 9. Convert optional chaining to safe access
  jsCode = jsCode.replace(/(\w+)\?\./g, '$1 && $1.');
  
  // 10. Remove generic type parameters
  jsCode = jsCode.replace(/<[^>]+>/g, '');
  
  // 11. Convert spread operator in arrays (simple cases)
  jsCode = jsCode.replace(/\[\.\.\.\s*(\w+)\s*\]/g, '$1.slice()');
  
  return jsCode;
}
