/**
 * Сборка API одним файлом. Снимок данных (JSON) инлайнится внутрь бандла,
 * поэтому в прод-образ не нужно копировать ни data/, ни node_modules.
 */
import { build } from 'esbuild';

const result = await build({
  entryPoints: ['src/server.ts'],
  outfile: 'dist/index.js',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  minify: true,
  sourcemap: false,
  // node:sqlite и остальные встроенные модули оставляем внешними.
  external: ['node:*'],
  banner: {
    js: "import{createRequire as __cr}from'node:module';const require=__cr(import.meta.url);",
  },
  metafile: true,
  logLevel: 'info',
});

const bytes = Object.values(result.metafile.outputs)[0]?.bytes ?? 0;
console.info(`dist/index.js: ${(bytes / 1024 / 1024).toFixed(2)} МБ`);
