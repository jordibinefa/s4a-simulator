const esbuild = require('esbuild');

esbuild.build({
  entryPoints: ['deps.js'],
  bundle: true,
  format: 'esm',
  outfile: 'deps.bundle.js',
  minify: true,
  target: 'es2020',
}).then(() => {
  console.log('Frontend bundle built successfully');
}).catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
