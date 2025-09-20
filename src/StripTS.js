function StripTS (TSsrcFile) {
  fetch(TSsrcFile)
    .then(response => response.text())
    .then(data => {
      const transformations = [
        {
          name: 'Type Annotation',
          pattern: /:\s*(\w+)\b/g,
          replacement: (match, p1) => isNaN(p1) && p1 !== 'true' && p1 !== 'false' ? '' : `: ${p1}`
        },
        {
          name: 'Decorator',
          pattern: /@.*\n/g,
          replacement: ''
        },
        {
          name: 'Access Modifier',
          pattern: /\b(public|private|protected)\b/g,
          replacement: ''
        },
        {
          name: 'Generic Type',
          pattern: /<\s*\w+\s*>/g,
          replacement: ''
        },
        {
          name: 'Interface Declaration',
          pattern: /^interface\s+\w+\s*{[^}]*}\s*$/gm,
          replacement: ''
        },
        {
          name: 'Enum',
          pattern: /enum\s+(\w+)\s*{([^}]+)}/g,
          replacement: (match, enumName, enumBody) => {
            const enumObject = enumBody.split(',')
              .map(field => {
                const [key, value] = field.trim().split(/\s*=\s*/);
                return `${key}: ${value ? value.trim() : JSON.stringify(key)}`;
              })
              .join(',\n  ');
            return `const ${enumName} = {\n  ${enumObject}\n};`;
          }
        }
      ];
      let compiledData = data;
      transformations.forEach(({ name, pattern, replacement }) => {
        if (data.match(pattern)) {
          console.log(`FLAG: ${name} spotted`);
          compiledData = compiledData.replace(pattern, replacement);
        }
      });
      const isModule = /(?:import\s+.*?from\s+|export\s+.*?\s)/.test(data);
      console.log(compiledData);
      const blob = new Blob([compiledData], { type: 'application/javascript' });
      const script = document.createElement('script');
      script.src = URL.createObjectURL(blob);
      if (isModule) {
          console.log('FLAG: Module syntax spotted');
          script.type = 'module';
      }
      document.body.appendChild(script);
    })
    .catch(console.error);
}
window.StripTS = StripTS;