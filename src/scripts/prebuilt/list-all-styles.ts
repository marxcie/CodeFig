// LIST ALL STYLES

// Execute
const styles = figma.getLocalPaintStyles().concat(figma.getLocalTextStyles()).concat(figma.getLocalEffectStyles()).concat(figma.getLocalGridStyles());
console.log('All styles:');
styles.forEach(s => console.log(`- ${s.name} (${s.type})`));
figma.notify(`Found ${styles.length} styles`);
