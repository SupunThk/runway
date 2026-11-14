import { readFileSync } from 'node:fs';

const document = readFileSync(
  new URL('../../../docs/assistant-knowledge.md', import.meta.url),
  'utf8',
);
const versionMatch = /^Version:\s*(\d{4}-\d{2}-\d{2})\./m.exec(document);
if (!versionMatch)
  throw new Error('Missing Version header in assistant-knowledge.md');
export const knowledgeVersion = versionMatch[1];
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
  payLinks: {
    title: 'Client payment links guide',
    url: '/docs#client-payment-links',
  },
  fundingProof: {
    title: 'Public funding proof guide',
    url: '/docs#public-funding-proof',
  },
  teamOps: { title: 'Team operations guide', url: '/docs#team-operations' },
  planner: { title: 'Runway planner guide', url: '/docs#runway-planner' },
} as const;
export type AssistantLinkKey = keyof typeof assistantLinks;

/**
 * Reviewed next questions per knowledge section. The server picks follow-up
 * suggestions only from this list, so generated text never becomes a clickable
 * prompt. Keep each question answerable from the section it belongs to.
 */
export const followUpQuestions: Partial<Record<string, readonly string[]>> = {
  runway: [
    'How do I pay a contractor with Runway?',
    'What can a team workspace do?',
  ],
  setup: [
    'How do I add Mezo testnet to my wallet manually?',
    'Why do I need test BTC as well as MUSD?',
  ],
  'manual-network-setup': ['How do I add MUSD to my wallet?'],
  'manual-musd-import': ['Why does my MUSD balance show zero after importing?'],
  funding: [
    'What happens when I cancel a payment schedule?',
    'How does the recipient claim their MUSD?',
    'How is a one-time payment different from a schedule?',
  ],
  'one-time-payment': [
    'Can a one-time payment be cancelled?',
    'How do I link a one-time transfer to an invoice?',
  ],
  claiming: [
    'Why is the claimable amount zero?',
    'Can someone else claim on my behalf?',
  ],
  cancellation: [
    'What happens to money that was already claimed?',
    'Can I edit a schedule instead of cancelling it?',
  ],
  overview: [
    'What are funded obligations?',
    'Why are my totals marked partial?',
  ],
  'runway-planner': [
    'How does the planner treat future-starting schedules?',
    'What do the BTC price drop scenarios show?',
  ],
  'funding-plans': [
    'What happens if I reject the funding step after borrowing?',
  ],
  'client-payment-links': [
    'What happens when a payment link expires?',
    'When is a payment request marked paid?',
  ],
  'public-funding-proof': [
    'What does committed MUSD mean on a funding proof?',
    'What does a funding proof not prove?',
  ],
  receipts: [
    'Are receipts the same as invoices?',
    'Why is my CSV export marked partial?',
  ],
  borrowing: [
    'What do stress scenarios assume?',
    'Is my wallet MUSD the same as loan debt?',
  ],
  workspace: [
    'How do I invite a manager or approver?',
    'How do I link an older schedule to an invoice?',
  ],
  reconciliation: [
    'What does reconciliation unavailable mean?',
    'What does conflict mean on an invoice?',
  ],
  recovery: [
    'Does Runway resubmit a dropped transaction?',
    'What happens if I remove saved transaction tracking?',
  ],
  assistant: [
    'Can Ask Runway look up a schedule?',
    'Is my conversation stored?',
  ],
  'trust-and-limits': ['Has Runway been independently audited?'],
  'mezo-network': ['How do I add Mezo testnet to my wallet manually?'],
  'mezo-musd': [
    'How does borrowing MUSD against BTC work?',
    'What happens if the BTC price falls?',
  ],
  'mezo-borrow': ['Can I borrow directly through Runway?'],
  'team-operations': [
    'How do approval quorums work?',
    'How do recurring payment plans work?',
  ],
  'business-model': ['Are fees charged on testnet?'],
};
