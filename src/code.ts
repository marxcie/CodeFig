// Show the UI
figma.showUI(__html__, { 
  width: 1000, 
  height: 600,
  themeColors: true
  // Note: resizable is not in the official Figma API types but works in practice
} as any);

// Handle messages from the UI
figma.ui.onmessage = (msg) => {
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
    figma.clientStorage.getAsync('userScripts').then((scripts) => {
      const userScripts = scripts || [];
      const existingIndex = userScripts.findIndex((s: any) => s.name === msg.name);
      
      const scriptData = {
        name: msg.name,
        code: msg.code,
        type: 'user'
      };

      if (existingIndex >= 0) {
        userScripts[existingIndex] = scriptData;
      } else {
        userScripts.push(scriptData);
      }

      figma.clientStorage.setAsync('userScripts', userScripts);
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
        
        console.log('Applied basic TypeScript transformations');
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
      console.error('Script execution error:', error);
      console.error('Code that failed:', msg.code);
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
