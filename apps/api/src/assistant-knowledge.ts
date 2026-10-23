import { readFileSync } from 'node:fs';

export const knowledgeVersion = '2026-10-23';
const document = readFileSync(
  new URL('../../../docs/assistant-knowledge.md', import.meta.url),
  'utf8',
);
export const knowledge = document
  .split(/^## /m)
  .slice(1)
  .map((section) => {
    const [heading, ...body] = section.split('\n');
    const [id, title, url] = heading.split(' | ');
    if (
      !/^[a-z][a-z-]+$/.test(id) ||
      !title ||
      !url ||
      !(
        /^(?:\/docs(?:#[a-z-]+)?|\/assistant)$/.test(url) ||
        /^https:\/\/mezo\.org\/docs\/[a-z0-9/-]+\/$/.test(url)
      )
    )
      throw new Error('Invalid assistant knowledge source');
    return { id, title, url, content: body.join('\n').trim() };
  });
if (new Set(knowledge.map((source) => source.id)).size !== knowledge.length)
  throw new Error('Duplicate assistant source');

export const assistantLinks = {
  overview: { title: 'Open Overview', url: '/' },
  create: { title: 'New payment', url: '/?create=1' },
  workspace: { title: 'Open Workspace', url: '/workspace' },
  borrowing: { title: 'Open Borrowing', url: '/borrowing' },
  docs: { title: 'Read the guide', url: '/docs' },
} as const;
