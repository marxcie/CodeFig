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
    try {
      const codeToExecute = msg.code;
      
      // Simple TypeScript-to-JavaScript conversion for runtime execution
      // This is much more reliable than complex regex patterns
      let jsCode = codeToExecute;
      
      // Only do basic conversions that are safe and common
      if (codeToExecute.includes('!') || codeToExecute.includes(': ')) {
        // Remove non-null assertions (!) - the most common issue
        jsCode = jsCode.replace(/(\w+)!/g, '$1');
        
        // Remove simple type annotations from function parameters
        jsCode = jsCode.replace(/(\w+):\s*\w+(\s*[,)])/g, '$1$2');
        
        // Remove simple variable type annotations
        jsCode = jsCode.replace(/:\s*\w+(\s*=)/g, '$1');
        
        debugLog('Backend: Applied basic TypeScript transformations');
      }
      
      // Create a function that has access to Figma API
      // Add common Figma API shortcuts for convenience
      const scriptFunction = new Function(
        'figma',
        `
        // Convenience shortcuts - make selection and currentPage available
        const selection = figma.currentPage.selection;
        const currentPage = figma.currentPage;
        
        // User code
        ${jsCode}
        `
      );
      
      scriptFunction(figma);
      
      figma.notify('Done! 😁');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      figma.notify(`Script error: ${errorMessage} 😳`, { error: true });
      debugError('Backend: Script execution error:', error);
      debugError('Backend: Code that failed:', msg.code);
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
