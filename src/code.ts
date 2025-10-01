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
    // Execute the script code with memory management
    const codeToExecute = msg.code;
    let jsCode: string = codeToExecute;
    
    try {
      // Pure JavaScript execution - no TypeScript conversion
      
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
        'window',
        `
        // Convenience shortcuts - make selection and currentPage available
        const selection = figma.currentPage.selection;
        const currentPage = figma.currentPage;
        
        // User code
        ${jsCode}
        `
      );
      
      
      // Store messages to forward after script execution (in backend scope)
      const pendingMessages: any[] = [];
      
      // Create a mock window object for the script context
      const mockWindow = {
        _infoPanelHandler: (message: any) => {
          debugLog('Backend: Script sent InfoPanel message:', message);
          // Directly forward the message to the UI from backend context
          figma.ui.postMessage(message);
        }
      };
      
      // Pass the real figma object, custom console, and mock window
      scriptFunction(figma, scriptConsole, mockWindow);
      
      // figma.notify('Done! 😁');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      figma.notify(`Script error: ${errorMessage} 😳`, { error: true });
      debugError('Backend: Script execution error:', error);
      debugError('Backend: Error message:', errorMessage);
      if (error instanceof Error && error.stack) {
        debugError('Backend: Error stack:', error.stack);
      }
      debugError('Backend: Code length:', msg.code.length);
      debugError('Backend: First 500 chars of code:', jsCode.substring(0, 500));
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
  
  if (msg.type === 'SAVE_COLLAPSED_SECTIONS') {
    // Save collapsed sections to client storage
    figma.clientStorage.setAsync('collapsedSections', msg.collapsedSections);
  }
  
  if (msg.type === 'LOAD_COLLAPSED_SECTIONS') {
    // Load collapsed sections from client storage
    figma.clientStorage.getAsync('collapsedSections').then((collapsedSections) => {
      figma.ui.postMessage({
        type: 'COLLAPSED_SECTIONS',
        collapsedSections: collapsedSections || []
      });
    });
  }
  
  if (msg.type === 'RESIZE_WINDOW') {
    // Resize the plugin window
    try {
      figma.ui.resize(msg.width, msg.height);
      debugLog('Backend: Resized window to:', msg.width, 'x', msg.height);
    } catch (error) {
      debugError('Backend: Failed to resize window:', error);
    }
  }
  
  if (msg.type === 'SELECT_NODE') {
    // Select a node by ID
    try {
      const node = figma.getNodeById(msg.nodeId);
      if (node) {
        figma.currentPage.selection = [node as SceneNode];
        figma.viewport.scrollAndZoomIntoView([node as SceneNode]);
        debugLog('Backend: Selected node:', node.name);
      } else {
        debugLog('Backend: Node not found:', msg.nodeId);
      }
    } catch (error) {
      debugError('Backend: Failed to select node:', error);
    }
  }
  
  if (msg.type === 'SELECT_NODES') {
    // Select multiple nodes by IDs (bulk selection)
    try {
      const nodes = msg.nodeIds
        .map((id: string) => figma.getNodeById(id))
        .filter((node: any) => node !== null) as SceneNode[];
      
      if (nodes.length > 0) {
        figma.currentPage.selection = nodes;
        figma.viewport.scrollAndZoomIntoView(nodes);
        figma.notify(`Selected ${nodes.length} nodes with similar issues`);
        debugLog('Backend: Selected nodes:', nodes.map(n => n.name));
      } else {
        debugLog('Backend: No valid nodes found for bulk selection');
      }
    } catch (error) {
      debugError('Backend: Failed to select nodes:', error);
    }
  }
};

