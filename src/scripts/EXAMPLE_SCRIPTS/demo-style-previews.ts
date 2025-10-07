// Demo Style Previews - Shows what the InfoPanel can display
// This script demonstrates the visual preview capabilities

@import { displayResults, createHtmlResult } from "@InfoPanel";

var CONFIG = {
  showPreviews: true
};

// Demo function to show different types of visual previews
function demoStylePreviews() {
  console.log('🎨 Demo Style Previews');
  console.log('=====================');
  
  var results = [];
  
  // Color preview
  results.push(createHtmlResult(`
    <div class="info-entry">
      <div class="info-entry-icon">🎨</div>
      <div class="info-entry-content">
        <div class="info-entry-title">Primary Blue</div>
        <div class="info-entry-subtitle">color variable</div>
        <div class="variable-preview">
          <div class="color-preview" style="background-color: #007AFF; width: 20px; height: 20px; border-radius: 4px; display: inline-block; margin-right: 8px;"></div>
          <span class="color-value">#007AFF</span>
        </div>
        <div class="info-entry-badge">12 nodes</div>
      </div>
    </div>
  `));
  
  // Typography preview
  results.push(createHtmlResult(`
    <div class="info-entry">
      <div class="info-entry-icon">📝</div>
      <div class="info-entry-content">
        <div class="info-entry-title">Heading Large</div>
        <div class="info-entry-subtitle">text style</div>
        <div class="style-preview">
          <div class="text-preview" style="font-family: 'Inter'; font-size: 24px; font-weight: 600; letter-spacing: -0.5px;">Aa</div>
          <div class="text-details">
            <span class="font-family">Inter</span>
            <span class="font-size">24px</span>
            <span class="font-weight">600</span>
          </div>
        </div>
        <div class="info-entry-badge">8 nodes</div>
      </div>
    </div>
  `));
  
  // Dimension preview
  results.push(createHtmlResult(`
    <div class="info-entry">
      <div class="info-entry-icon">📊</div>
      <div class="info-entry-content">
        <div class="info-entry-title">Container Width</div>
        <div class="info-entry-subtitle">width variable</div>
        <div class="variable-preview">
          <span class="dimension-value">320px</span>
        </div>
        <div class="info-entry-badge">15 nodes</div>
      </div>
    </div>
  `));
  
  // Spacing preview
  results.push(createHtmlResult(`
    <div class="info-entry">
      <div class="info-entry-icon">📊</div>
      <div class="info-entry-content">
        <div class="info-entry-title">Card Padding</div>
        <div class="info-entry-subtitle">paddingLeft variable</div>
        <div class="variable-preview">
          <span class="spacing-value">16px</span>
        </div>
        <div class="info-entry-badge">23 nodes</div>
      </div>
    </div>
  `));
  
  // Effect preview
  results.push(createHtmlResult(`
    <div class="info-entry">
      <div class="info-entry-icon">🎨</div>
      <div class="info-entry-content">
        <div class="info-entry-title">Card Shadow</div>
        <div class="info-entry-subtitle">effect style</div>
        <div class="style-preview">
          <div class="effect-preview" style="width: 20px; height: 20px; background: #f0f0f0; border-radius: 4px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); display: inline-block; margin-right: 8px;"></div>
          <span class="effect-value">Drop Shadow</span>
        </div>
        <div class="info-entry-badge">5 nodes</div>
      </div>
    </div>
  `));
  
  // Stroke preview
  results.push(createHtmlResult(`
    <div class="info-entry">
      <div class="info-entry-icon">🎨</div>
      <div class="info-entry-content">
        <div class="info-entry-title">Border Accent</div>
        <div class="info-entry-subtitle">stroke style</div>
        <div class="style-preview">
          <div class="stroke-preview" style="border: 2px solid #FF6B6B; width: 20px; height: 20px; border-radius: 4px; display: inline-block; margin-right: 8px;"></div>
          <span class="color-value">#FF6B6B</span>
        </div>
        <div class="info-entry-badge">3 nodes</div>
      </div>
    </div>
  `));
  
  // Display results
  displayResults({
    title: 'Style Preview Demo',
    results: results,
    type: 'info'
  });
  
  console.log('✅ Demo completed! Check the InfoPanel for visual previews.');
}

// Run the demo
demoStylePreviews();

