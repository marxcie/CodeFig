// RENAME STYLES (font- to text-)

// Configuration - Change these values as needed
const searchPattern = 'font-';
const replacePattern = 'text-';

const renameStyles = (searchPattern: string, replacePattern: string) => {
  const styles = figma.getLocalPaintStyles().concat(figma.getLocalTextStyles()).concat(figma.getLocalEffectStyles()).concat(figma.getLocalGridStyles());
  let count = 0;
  styles.forEach(style => {
    const newName = style.name.replace(new RegExp(searchPattern, 'g'), replacePattern);
    if (newName !== style.name) {
      style.name = newName;
      count++;
    }
  });
  return count;
};

// Execute
const count = renameStyles(searchPattern, replacePattern);
figma.notify(`Renamed ${count} styles`);
