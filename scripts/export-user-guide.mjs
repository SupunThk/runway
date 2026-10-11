import { writeFile } from 'node:fs/promises';
import { guideMarkdown } from '../apps/web/src/guide.ts';

await writeFile(
  new URL('../docs/user-guide.md', import.meta.url),
  guideMarkdown,
);
console.log('Updated docs/user-guide.md from the in-app guide.');
