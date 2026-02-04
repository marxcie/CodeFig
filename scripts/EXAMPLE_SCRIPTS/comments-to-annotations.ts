// Comments to Annotations
// @DOC_START
// # Create Annotations from Comments
// Converts file comments into Figma annotations and optional invisible anchor frames.
//
// ## Overview
// Uses the Figma REST API to read comments, then creates annotations (and optionally anchor frames) at comment positions. Requires a Figma Personal Access Token and a file key or URL.
//
// ## Config options
// - **TOKEN_STORAGE_KEY** – Client storage key for the Personal Access Token.
// - **FILE_KEY_OR_URL** – Figma file key or file URL; leave empty to use stored key or be prompted.
// - **ANNOTATION_ANCHORS** – If true, creates invisible anchor frames at comment locations.
// - **INCLUDE_RESOLVED_COMMENTS** – If true, resolved comments are included; default false.
// @DOC_END

// ============================================================================
// CONFIGURATION
// ============================================================================

// @CONFIG_START
// Personal Access Token for Figma REST API (stored securely in client storage)
var TOKEN_STORAGE_KEY = "figma_personal_access_token";

// FILE_KEY_OR_URL: Optional - paste either a Figma file key or a URL from your Figma file here
// If it's a URL, the file key will be automatically extracted from it
// Examples:
//   - Direct key: YDJBPC3C4nUOEQyPGF6cyh
//   - URL: https://www.figma.com/design/YDJBPC3C4nUOEQyPGF6cyh/Website-Exploration?node-id=9700-224736
// Leave empty to use stored file key or be prompted
var FILE_KEY_OR_URL = "";

// ANNOTATION_ANCHORS: Create invisible anchor frames at comment locations
// This allows annotations to be precisely positioned where comments were placed
var ANNOTATION_ANCHORS = true;

// INCLUDE_RESOLVED_COMMENTS: Whether to include resolved comments in annotations
// Default is false - only unresolved comments will be converted to annotations
var INCLUDE_RESOLVED_COMMENTS = false;
// @CONFIG_END

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

async function createAnnotationsFromComments() {
  try {
    // Check if user has selected nodes
    var selection = figma.currentPage.selection;
    if (selection.length === 0) {
      figma.notify("⚠️ Please select at least one frame or section");
      figma.closePlugin();
      return;
    }
    
    // Get Personal Access Token
    var token = await getOrPromptForToken();
    if (!token) {
      figma.notify("❌ Personal Access Token is required");
      figma.closePlugin();
      return;
    }
    
    // Get File Key
    var fileKey = await getFileKey();
    if (!fileKey) {
      figma.notify("❌ Could not determine file key");
      figma.closePlugin();
      return;
    }
    
    // Fetch comments from API
    var comments = await fetchCommentsFromFile(fileKey, token);
    if (!comments || comments.length === 0) {
      figma.notify("ℹ️ No comments found in this file");
      figma.closePlugin();
      return;
    }
    
    // Build node map for selected nodes
    var nodeMap = buildNodeMap(selection);
    
    // Get all node IDs from selection
    var nodeIds = collectNodeIds(selection);
    
    // Filter comments to only those relevant to selected nodes
    var relevantComments = filterCommentsForNodes(comments, nodeIds);
    
    if (relevantComments.length === 0) {
      var message = INCLUDE_RESOLVED_COMMENTS 
        ? "ℹ️ No comments found for selected nodes"
        : "ℹ️ No unresolved comments found for selected nodes";
      figma.notify(message);
      figma.closePlugin();
      return;
    }
    
    // Group all comments into threads
    var allThreads = groupCommentsIntoThreads(relevantComments);
    
    // Map each comment to its thread root and target frame
    var threadAnchors = new Map();
    
    for (var threadEntry of Array.from(allThreads.entries())) {
      var rootCommentId = threadEntry[0];
      var thread = threadEntry[1];
      
      // Determine target frame based on root comment's node_id
      var rootComment = thread[0];
      var targetFrame = null;
      
      if (rootComment.client_meta && rootComment.client_meta.node_id) {
        var commentNodeId = String(rootComment.client_meta.node_id).replace(/-/g, ':');
        var commentNode = nodeMap.get(commentNodeId);
        
        // Walk up the hierarchy to find a Frame or Section that can contain children
        if (commentNode) {
          // First, check if the comment node itself is a Frame or Section in our selection
          if ((commentNode.type === 'FRAME' || commentNode.type === 'SECTION') && 'children' in commentNode) {
            targetFrame = commentNode;
          } else {
            // Walk up the parent chain to find a Frame or Section
            var currentNode = commentNode;
            while (currentNode && currentNode.parent && currentNode.parent.type !== 'PAGE') {
              currentNode = currentNode.parent;
              
              // Check if this parent is a Frame or Section and is in our node map (selection)
              if ((currentNode.type === 'FRAME' || currentNode.type === 'SECTION') && 'children' in currentNode) {
                // Verify it's in our node map
                var isInSelection = false;
                for (var entry of Array.from(nodeMap.entries())) {
                  if (entry[1] === currentNode) {
                    isInSelection = true;
                    break;
                  }
                }
                
                if (isInSelection) {
                  targetFrame = currentNode;
                  break;
                }
              }
            }
          }
          
          // If we still don't have a target frame, check if comment node is a descendant of any selected Frame/Section
          if (!targetFrame) {
            for (var i = 0; i < selection.length; i++) {
              var selNode = selection[i];
              if ((selNode.type === 'FRAME' || selNode.type === 'SECTION') && 'children' in selNode) {
                // Check if the comment node is within this selected frame by walking up
                var checkNode = commentNode;
                while (checkNode && checkNode.parent && checkNode.parent.type !== 'PAGE') {
                  if (checkNode.parent === selNode) {
                    targetFrame = selNode;
                    break;
                  }
                  checkNode = checkNode.parent;
                }
                if (targetFrame) break;
              }
            }
          }
        }
      }
      
      // Create one anchor for this thread
      var anchor = await createAnchorElement(rootComment, nodeMap, targetFrame);
      
      if (anchor) {
        // Map all comments in this thread to the same anchor
        for (var ci = 0; ci < thread.length; ci++) {
          threadAnchors.set(thread[ci].id, anchor);
        }
      }
    }
    
    // Group comments by anchor to create annotations in batches
    var commentsByAnchor = new Map();
    for (var i = 0; i < relevantComments.length; i++) {
      var comment = relevantComments[i];
      var anchor = threadAnchors.get(comment.id);
      if (anchor) {
        if (!commentsByAnchor.has(anchor.id)) {
          commentsByAnchor.set(anchor.id, { anchor: anchor, comments: [] });
        }
        commentsByAnchor.get(anchor.id).comments.push(comment);
      } else {
        console.warn("No anchor found for comment " + comment.id + ", skipping annotation creation.");
      }
    }
    
    // Create annotations in batches for each anchor
    var createdCount = 0;
    var anchorIdsToProcess = Array.from(commentsByAnchor.keys());
    for (var anchorIdx = 0; anchorIdx < anchorIdsToProcess.length; anchorIdx++) {
      var anchorId = anchorIdsToProcess[anchorIdx];
      var anchorData = commentsByAnchor.get(anchorId);
      var anchorNode = anchorData.anchor;
      var commentsForAnchor = anchorData.comments;
      
      if (anchorNode && commentsForAnchor.length > 0) {
        var addedCount = await createMultipleAnnotations(commentsForAnchor, anchorNode);
        if (addedCount > 0) {
          createdCount += addedCount;
        }
      }
    }
    
    figma.notify("✅ Created " + createdCount + " annotation(s) from " + relevantComments.length + " comment(s)");
    figma.closePlugin();
    
  } catch (error) {
    console.error("Error in createAnnotationsFromComments:", error);
    figma.notify("❌ Error: " + error.message);
    figma.closePlugin();
  }
}

// ============================================================================
// TOKEN MANAGEMENT
// ============================================================================

async function getOrPromptForToken() {
  try {
    var stored = await figma.clientStorage.getAsync(TOKEN_STORAGE_KEY);
    if (stored) {
      return stored;
    }
    
    var token = await promptForToken();
    if (token) {
      await figma.clientStorage.setAsync(TOKEN_STORAGE_KEY, token);
      figma.notify("✅ Token saved securely");
    }
    return token;
  } catch (error) {
    console.error("Error with token:", error);
    return null;
  }
}

function promptForToken() {
  return new Promise(function(resolve) {
    figma.showUI(__html__, { width: 400, height: 300, title: "Figma Personal Access Token" });
    
    figma.ui.onmessage = function(msg) {
      if (msg.type === 'token') {
        figma.ui.close();
        resolve(msg.token);
      } else if (msg.type === 'cancel') {
        figma.ui.close();
        resolve(null);
      }
    };
  });
}

// ============================================================================
// FILE KEY EXTRACTION
// ============================================================================

async function getFileKey() {
  try {
    // First, try to get the file key directly from Figma
    var fileKey = figma.fileKey;
    if (fileKey) {
      return fileKey;
    }
    
    // Next, check if FILE_KEY_OR_URL is configured in the script
    if (FILE_KEY_OR_URL && FILE_KEY_OR_URL.trim() !== "") {
      var input = FILE_KEY_OR_URL.trim();
      // Try to extract from URL first
      var extracted = extractFileKeyFromUrl(input);
      if (extracted) {
        // Store it for future use
        await figma.clientStorage.setAsync("figma_file_key", extracted);
        return extracted;
      } else {
        // If extraction failed, assume it's a direct file key
        // Store it for future use
        await figma.clientStorage.setAsync("figma_file_key", input);
        return input;
      }
    }
    
    // Check if we have a stored file key
    var storedFileKey = await figma.clientStorage.getAsync("figma_file_key");
    if (storedFileKey) {
      return storedFileKey;
    }
    
    // Finally, prompt the user for a URL or file key and save it
    var input = await promptForFileUrlOrKey();
    if (input) {
      // Try to extract from URL first
      var extracted = extractFileKeyFromUrl(input);
      if (extracted) {
        await figma.clientStorage.setAsync("figma_file_key", extracted);
        figma.notify("✅ File key saved securely");
        return extracted;
      } else {
        // If extraction failed, assume it's a direct file key
        if (input.trim().length > 0) {
          await figma.clientStorage.setAsync("figma_file_key", input.trim());
          figma.notify("✅ File key saved securely");
          return input.trim();
        }
      }
    }
    
    return null;
  } catch (error) {
    console.error("Error getting file key:", error);
    return null;
  }
}

function extractFileKeyFromUrl(url) {
  try {
    var patterns = [
      /figma\.com\/(?:file|design)\/([a-zA-Z0-9]+)/,
      /figma\.com\/board\/([a-zA-Z0-9]+)/,
      /\/([a-zA-Z0-9]{22,})\//
    ];
    
    for (var i = 0; i < patterns.length; i++) {
      var match = url.match(patterns[i]);
      if (match && match[1]) {
        return match[1];
      }
    }
    
    return null;
  } catch (error) {
    console.error("Error extracting file key:", error);
    return null;
  }
}

function promptForFileUrlOrKey() {
  return new Promise(function(resolve) {
    figma.showUI(__html__, { width: 400, height: 250, title: "File URL or Key" });
    
    figma.ui.onmessage = function(msg) {
      if (msg.type === 'fileUrl') {
        figma.ui.close();
        resolve(msg.url);
      } else if (msg.type === 'cancel') {
        figma.ui.close();
        resolve(null);
      }
    };
  });
}

// ============================================================================
// FIGMA REST API
// ============================================================================

async function fetchCommentsFromFile(fileKey, token) {
  try {
    var url = "https://api.figma.com/v1/files/" + fileKey + "/comments";
    var response = await fetch(url, {
      headers: {
        "X-Figma-Token": token
      }
    });
    
    if (!response.ok) {
      throw new Error("API request failed: " + response.status);
    }
    
    var data = await response.json();
    return data.comments || [];
  } catch (error) {
    console.error("Error fetching comments:", error);
    throw error;
  }
}

// ============================================================================
// NODE PROCESSING
// ============================================================================

var MAX_NODES = 5000;

function buildNodeMap(nodes) {
  var map = new Map();
  var queue = [];
  var processed = new Set();
  var nodeCount = 0;
  
  for (var i = 0; i < nodes.length; i++) {
    queue.push(nodes[i]);
  }
  
  while (queue.length > 0 && nodeCount < MAX_NODES) {
    var node = queue.shift();
    
    if (!node || !node.id || processed.has(node.id)) {
      continue;
    }
    
    processed.add(node.id);
    nodeCount++;
    
    try {
      map.set(node.id, node);
      
      if ('children' in node && Array.isArray(node.children)) {
        var children = node.children;
        var isSection = node.type === 'SECTION';
        var maxChildren = isSection ? 1000 : children.length;
        
        for (var j = 0; j < Math.min(children.length, maxChildren); j++) {
          if (children[j] && children[j].id && !processed.has(children[j].id)) {
            queue.push(children[j]);
          }
        }
      }
    } catch (e) {
      console.warn("Error processing node " + (node.id || "unknown") + ": " + e.message);
    }
  }
  
  return map;
}

function collectNodeIds(nodes) {
  var ids = [];
  var queue = [];
  var processed = new Set();
  var nodeCount = 0;
  
  for (var i = 0; i < nodes.length; i++) {
    queue.push(nodes[i]);
  }
  
  while (queue.length > 0 && nodeCount < MAX_NODES) {
    var node = queue.shift();
    
    if (!node || !node.id || processed.has(node.id)) {
      continue;
    }
    
    processed.add(node.id);
    nodeCount++;
    
    try {
      var normalizedId = node.id.replace(/:/g, '-');
      ids.push(normalizedId);
      ids.push(node.id);
      
      if ('children' in node && Array.isArray(node.children)) {
        var children = node.children;
        var isSection = node.type === 'SECTION';
        var maxChildren = isSection ? 1000 : children.length;
        
        for (var j = 0; j < Math.min(children.length, maxChildren); j++) {
          if (children[j] && children[j].id && !processed.has(children[j].id)) {
            queue.push(children[j]);
          }
        }
      }
    } catch (e) {
      console.warn("Error collecting node ID for " + (node.id || "unknown") + ": " + e.message);
    }
  }
  
  return ids;
}

// ============================================================================
// COMMENT FILTERING AND GROUPING
// ============================================================================

var MAX_COMMENTS = 200;

function filterCommentsForNodes(comments, nodeIds) {
  var nodeIdSet = new Set(nodeIds);
  var relevantRootComments = new Set();
  var allRelevantComments = new Set();
  
  // First pass: find all root comments that match the selection
  for (var i = 0; i < Math.min(comments.length, MAX_COMMENTS); i++) {
    var comment = comments[i];
    
    if (!comment.parent_id) {
      // This is a root comment
      if (comment.client_meta && comment.client_meta.node_id) {
        var nodeId = String(comment.client_meta.node_id);
        if (nodeIdSet.has(nodeId)) {
          // Check if we should include this thread based on resolved status
          if (!comment.resolved || INCLUDE_RESOLVED_COMMENTS) {
            relevantRootComments.add(comment.id);
            allRelevantComments.add(comment);
          }
        }
      }
    }
  }
  
  // Second pass: include all comments in relevant threads (all replies, regardless of resolved status)
  // This ensures all comments in unresolved threads are shown
  function findAllRepliesInThread(rootCommentId, allComments) {
    var replies = [];
    for (var i = 0; i < allComments.length; i++) {
      if (allComments[i].parent_id === rootCommentId) {
        replies.push(allComments[i]);
        var nestedReplies = findAllRepliesInThread(allComments[i].id, allComments);
        replies = replies.concat(nestedReplies);
      }
    }
    return replies;
  }
  
  // For each relevant root comment, include all its replies
  for (var rootId of relevantRootComments) {
    var rootComment = null;
    for (var i = 0; i < comments.length; i++) {
      if (comments[i].id === rootId) {
        rootComment = comments[i];
        break;
      }
    }
    
    if (rootComment) {
      var allReplies = findAllRepliesInThread(rootId, comments);
      for (var j = 0; j < allReplies.length; j++) {
        allRelevantComments.add(allReplies[j]);
      }
    }
  }
  
  return Array.from(allRelevantComments);
}

function groupCommentsIntoThreads(comments) {
  var threads = new Map();
  var commentMap = new Map();
  
  for (var i = 0; i < comments.length; i++) {
    commentMap.set(comments[i].id, comments[i]);
  }
  
  function findAllReplies(commentId, allComments) {
    var replies = [];
    for (var i = 0; i < allComments.length; i++) {
      if (allComments[i].parent_id === commentId) {
        replies.push(allComments[i]);
        var nestedReplies = findAllReplies(allComments[i].id, allComments);
        replies = replies.concat(nestedReplies);
      }
    }
    return replies;
  }
  
  for (var i = 0; i < comments.length; i++) {
    var comment = comments[i];
    
    if (!comment.parent_id) {
      var thread = [comment];
      
      var allReplies = findAllReplies(comment.id, comments);
      thread = thread.concat(allReplies);
      
      thread.sort(function(a, b) {
        var timeA = new Date(a.created_at || 0).getTime();
        var timeB = new Date(b.created_at || 0).getTime();
        return timeA - timeB;
      });
      
      threads.set(comment.id, thread);
    }
  }
  
  return threads;
}

// ============================================================================
// ANNOTATION CREATION
// ============================================================================

function delay(ms) {
  return new Promise(function(resolve) {
    setTimeout(resolve, ms);
  });
}

async function createAnchorElement(comment, nodeMap, targetFrame) {
  try {
    if (!ANNOTATION_ANCHORS) {
      return null;
    }
    
    // Step 1: Get the comment's position first
    // Comment position is in node_offset (relative to the node it's attached to)
    var commentOffset = { x: 0, y: 0 };
    if (comment.client_meta && comment.client_meta.node_offset) {
      commentOffset.x = comment.client_meta.node_offset.x || 0;
      commentOffset.y = comment.client_meta.node_offset.y || 0;
    }
    
    // Step 2: Create the annotation anchor
    var anchor = figma.createFrame();
    anchor.name = "📍 Comment Anchor";
    anchor.resize(1, 1);
    anchor.fills = [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 }, opacity: 0 }];
    anchor.strokes = [];
    anchor.layoutMode = "NONE";
    
    // Step 3: Add to parent (targetFrame or page)
    if (targetFrame) {
      // Find the node the comment is attached to
      var commentNode = null;
      if (comment.client_meta && comment.client_meta.node_id) {
        var nodeId = String(comment.client_meta.node_id).replace(/-/g, ':');
        commentNode = nodeMap.get(nodeId);
      }
      
      targetFrame.appendChild(anchor);
      
      // Step 4: Set to absolute positioning
      if ('layoutPositioning' in anchor) {
        anchor.layoutPositioning = 'ABSOLUTE';
      }
      
      // Step 5: Apply position relative to targetFrame
      // node_offset is relative to the node the comment is attached to
      var relativeX, relativeY;
      
      if (commentNode) {
        // Get absolute position of the comment's node
        var nodeAbsPos = getAbsoluteNodePosition(commentNode);
        
        // Comment offset is relative to the node, so add node's absolute position
        var commentAbsX = nodeAbsPos.x + commentOffset.x;
        var commentAbsY = nodeAbsPos.y + commentOffset.y;
        
        // Get absolute position of target frame
        var frameAbsPos = getAbsoluteNodePosition(targetFrame);
        
        // Calculate relative to frame
        relativeX = commentAbsX - frameAbsPos.x;
        relativeY = commentAbsY - frameAbsPos.y;
      } else {
        // No node, treat comment offset as absolute canvas coordinates (unlikely but handle it)
        var frameAbsPos = getAbsoluteNodePosition(targetFrame);
        relativeX = commentOffset.x - frameAbsPos.x;
        relativeY = commentOffset.y - frameAbsPos.y;
      }
      
      anchor.x = relativeX;
      anchor.y = relativeY;
    } else {
      // No target frame, add to page and use absolute coordinates
      var page = figma.currentPage;
      page.appendChild(anchor);
      
      // Step 5: Apply absolute position
      anchor.x = commentOffset.x;
      anchor.y = commentOffset.y;
    }
    
    anchor.locked = true;
    
    await delay(5);
    
    if (!('annotations' in anchor)) {
      console.warn("Created anchor does not support annotations");
      return null;
    }
    
    return anchor;
  } catch (e) {
    console.error("Error creating anchor element:", e.message);
    return null;
  }
}

function getAbsoluteNodePosition(node) {
  if (!node) {
    return { x: 0, y: 0 };
  }
  
  var x = 0;
  var y = 0;
  var current = node;
  
  // Walk up the parent chain, summing positions
  while (current && current.type !== 'PAGE') {
    // Only add position if the node has x/y properties
    if ('x' in current && typeof current.x === 'number') {
      x += current.x;
    }
    if ('y' in current && typeof current.y === 'number') {
      y += current.y;
    }
    current = current.parent;
  }
  
  return { x: x, y: y };
}

async function createMultipleAnnotations(comments, node) {
  try {
    if (!node || !Array.isArray(comments) || comments.length === 0) {
      return 0;
    }
    
    if (!('annotations' in node)) {
      return 0;
    }
    
    var existingAnnotations = [];
    try {
      var currentAnnotations = node.annotations;
      if (currentAnnotations && Array.isArray(currentAnnotations)) {
        existingAnnotations = currentAnnotations.map(function(ann) {
          var copy = {};
          for (var key in ann) {
            copy[key] = ann[key];
          }
          return copy;
        });
      }
    } catch (e) {
      existingAnnotations = [];
    }
    
    var newAnnotationsToAdd = [];
    for (var i = 0; i < comments.length; i++) {
      var comment = comments[i];
      var labelParts = [];
      var commentText = comment.message || "No message";
      var authorName = getAuthorName(comment);
      var timestamp = formatTimestamp(comment.created_at);
      var isReply = comment.parent_id !== null && comment.parent_id !== undefined;
      
      if (authorName !== "Unknown" || timestamp) {
        var header = "**" + authorName;
        if (timestamp) {
          header += " • " + timestamp;
        }
        header += "**";
        labelParts.push(header);
        labelParts.push("");
      }
      
      var processedText = convertUrlsToLinks(commentText);
      labelParts.push(processedText);
      
      if (isReply) {
        labelParts.push("");
        labelParts.push("*↩ Reply*");
      }
      
      var labelMarkdown = labelParts.join("\n");
      newAnnotationsToAdd.push({ labelMarkdown: String(labelMarkdown) });
    }
    
    var finalAnnotations = existingAnnotations.concat(newAnnotationsToAdd);
    
    try {
      node.annotations = finalAnnotations;
      
      await delay(10);
      
      var verifyAnnotations = node.annotations;
      if (verifyAnnotations && Array.isArray(verifyAnnotations) && verifyAnnotations.length === finalAnnotations.length) {
        return newAnnotationsToAdd.length;
      } else {
        node.annotations = finalAnnotations;
        await delay(50);
        verifyAnnotations = node.annotations;
        if (verifyAnnotations && Array.isArray(verifyAnnotations) && verifyAnnotations.length === finalAnnotations.length) {
          return newAnnotationsToAdd.length;
        } else {
          console.warn("Annotation verification failed for anchor " + node.id);
          return 0;
        }
      }
    } catch (e) {
      console.error("Error setting annotations on node " + node.id + ": " + e.message);
      return 0;
    }
  } catch (e) {
    console.error("Error in createMultipleAnnotations:", e.message);
    return 0;
  }
}

function convertUrlsToLinks(text) {
  var urlRegex = /(https?:\/\/[^\s]+)/g;
  return text.replace(urlRegex, function(url) {
    return "[" + url + "](" + url + ")";
  });
}

function getAuthorName(comment) {
  if (comment.user && comment.user.handle) {
    return comment.user.handle;
  }
  if (comment.user && comment.user.email) {
    return comment.user.email.split('@')[0];
  }
  return "Unknown";
}

function formatTimestamp(timestamp) {
  if (!timestamp) return "";
  
  try {
    var date = new Date(timestamp);
    var now = new Date();
    var diffMs = now.getTime() - date.getTime();
    var diffMins = Math.floor(diffMs / 60000);
    var diffHours = Math.floor(diffMs / 3600000);
    var diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return "just now";
    if (diffMins < 60) return diffMins + "m ago";
    if (diffHours < 24) return diffHours + "h ago";
    if (diffDays < 7) return diffDays + "d ago";
    
    return date.toLocaleDateString();
  } catch (e) {
    return "";
  }
}

// ============================================================================
// RUN
// ============================================================================

createAnnotationsFromComments();
