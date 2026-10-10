import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { realpathSync } from 'node:fs';
import { createRequire } from 'node:module';

// Official npm-distributed native binary. WSL is optional on this machine.
const packagePath = realpathSync(resolve('node_modules/@foundry-rs/forge'));
const { BINARY_NAME, PLATFORM_SPECIFIC_PACKAGE_NAME } = await import(
  new URL('../node_modules/@foundry-rs/forge/const.mjs', import.meta.url)
);
const require = createRequire(resolve(packagePath, 'package.json'));
const binary = require.resolve(
  `${PLATFORM_SPECIFIC_PACKAGE_NAME('forge')}/bin/${BINARY_NAME('forge')}`,
);
const result = spawnSync(binary, process.argv.slice(2), { stdio: 'inherit' });
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
