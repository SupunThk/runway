import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build, createServer } from 'vite';

// Isolated local checks use public example settings only, never dotenv files.
for (const line of readFileSync(
  new URL('../.env.example', import.meta.url),
  'utf8',
).split(/\r?\n/)) {
  const match = /^(VITE_[A-Z0-9_]+)=(.*)$/.exec(line);
  if (match) process.env[match[1]] = match[2];
}
const port = Number(process.env.RUNWAY_LOCAL_PORT || 5300);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error('Invalid local port.');
const configuration = {
  root: fileURLToPath(new URL('../apps/web', import.meta.url)),
  configFile: fileURLToPath(
    new URL('../apps/web/vite.config.ts', import.meta.url),
  ),
  envDir: false,
};
if (process.argv.includes('--build')) {
  await build(configuration);
} else {
  const server = await createServer({
    ...configuration,
    server: {
      host: '127.0.0.1',
      port,
      strictPort: true,
      ...(process.env.RUNWAY_LOCAL_API
        ? { proxy: { '/api': process.env.RUNWAY_LOCAL_API } }
        : {}),
    },
  });
  await server.listen();
  server.printUrls();
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.on(signal, async () => {
      await server.close();
      process.exit(0);
    });
}
