export type GuideSection = {
  id: string;
  title: string;
  paragraphs?: string[];
  steps?: string[];
  bullets?: string[];
};

// Shared by the in-app documentation and the downloadable Markdown guide.
export const guideSections: GuideSection[] = [
  {
    id: 'how-it-works',
    title: 'How Runway works',
    paragraphs: [
      'Runway supports one-time MUSD transfers and fully funded contractor payment schedules on Mezo testnet. With a schedule, a founder or sender deposits the entire agreed MUSD payment into a smart contract. The contractor or recipient earns that payment gradually over a fixed period.',
      'The contract holds the funds and enforces the schedule. Earning happens as chain time passes; a claim transaction is needed to transfer earned MUSD to the recipient. Keeping a browser open does not send payments automatically.',
    ],
    bullets: [
      'Fund once: the full amount is reserved upfront.',
      'Earn over time: entitlement grows linearly between the start and end.',
      'Claim when ready: the recipient receives the earned amount that has not already been claimed.',
      'Cancel fairly: only the sender can cancel, returning unearned funds while preserving the recipient’s earned entitlement.',
    ],
  },
  {
    id: 'getting-started',
    title: 'Before you start',
    paragraphs: [
      'Use a dedicated test wallet. Runway currently runs on Mezo testnet (chain ID 31611). MUSD funds payments; test BTC pays network transaction fees. MEZO tokens are not required for this payment flow.',
      'You can read this guide and open a shared schedule without connecting a wallet. Connect a wallet to discover your sent and received schedules or submit a transaction.',
    ],
    steps: [
      'Open Runway and select Connect wallet. Choose your installed EVM browser wallet; Rabby and MetaMask have explicit connectors, and other compatible wallets may appear through wallet discovery.',
      'Select the intended account. Open Wallet setup beside your connected wallet and choose Add / switch Mezo testnet. If your wallet has not saved the network, review and approve its add-network prompt, then switch to Mezo testnet.',
      'In Wallet setup, choose Add MUSD to wallet and confirm in your wallet to show the token. This does not mint, buy or transfer MUSD. These setup requests do not spend gas. If your wallet does not support them, expand Manual network & token settings and enter those details in your wallet.',
      'If you are funding a schedule, make sure the account has enough test MUSD for the full payment and test BTC for fees. An account submitting a claim also needs test BTC.',
    ],
  },
  {
    id: 'manual-network-setup',
    title: 'Manually add Mezo testnet to your wallet',
    paragraphs: [
      'You can add the network directly in your wallet without connecting to Runway. These settings are for Mezo testnet, which is the network Runway uses. Menu names vary between wallets.',
      'Adding or switching a network does not transfer funds or spend gas. BTC is the native gas currency on Mezo; you do not need to import a BTC token contract for network fees.',
    ],
    steps: [
      'Open your wallet’s network selector or Settings → Networks. Choose Add network, then Add a network manually or Custom network.',
      'Enter the network details listed below. Use the decimal chain ID 31611 in a normal wallet form.',
      'Save or approve the network, then select Mezo Testnet in your wallet. Check the selected network before sending or importing tokens.',
    ],
    bullets: [
      'Network name: Mezo Testnet',
      'RPC URL: https://rpc.test.mezo.org',
      'Chain ID: 31611',
      'Currency symbol: BTC',
      'Native currency decimals, if requested: 18',
      'Block explorer URL: https://explorer.test.mezo.org',
    ],
  },
  {
    id: 'manual-musd-import',
    title: 'Manually add MUSD to your wallet',
    paragraphs: [
      'Importing MUSD makes the token visible in your wallet. It does not mint, buy or transfer tokens, and it costs no gas. If your balance is zero, importing the token will not change that.',
      'Use the MUSD token contract below, not Runway’s payment contract. This is the Mezo testnet token address; mainnet uses a different token address.',
    ],
    steps: [
      'Select Mezo Testnet in your wallet first.',
      'Open the Tokens or Assets tab, choose Import tokens or Add token, then select Custom token.',
      'Paste the MUSD token contract address below. If your wallet fills the symbol and decimals automatically, check that they match MUSD and 18. Otherwise enter those values yourself.',
      'Review the details, confirm the import and return to the token list. If MUSD is already listed, you do not need to import it again.',
    ],
    bullets: [
      'Network: Mezo Testnet (chain ID 31611)',
      'MUSD token contract: 0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503',
      'Token symbol: MUSD',
      'Token decimals: 18',
    ],
  },
  {
    id: 'fund-a-schedule',
    title: 'Founder: fund a schedule',
    steps: [
      'Open New payment and choose Payment over time. Enter the contractor’s recipient wallet, total MUSD funding, and payment period. Choose minutes, hours, or days and enter a whole number, up to 365 days.',
      'Check the recipient carefully: the recipient, amount, and timing cannot be edited after creation.',
      'Submit the form. If the contract does not already have sufficient allowance, your wallet first asks you to approve the exact funding amount. Approval permits spending; it does not fund a schedule.',
      'Confirm schedule creation in your wallet. This separate transaction transfers the full MUSD amount into the payment contract. Runway sets the start using current chain time plus a two-minute signing buffer after any required approval; use the confirmed schedule’s timestamps as the source of truth.',
      'Wait for confirmation, then open the funded schedule and share its /schedules/<id> link with the contractor.',
    ],
    paragraphs: [
      'A rejected or reverted creation does not create a funded schedule. If approval succeeded first, that allowance may remain. Check the saved transaction before trying again.',
    ],
  },
  {
    id: 'one-time-payment',
    title: 'Send a one-time payment',
    steps: [
      'Open New payment and choose One-time payment. Enter the recipient wallet and MUSD amount. No duration is required.',
      'Check the recipient and amount, then choose Send MUSD and confirm the transfer in your wallet. You need MUSD for the payment and test BTC for gas. No token approval or recipient claim is required.',
      'Wait for confirmation and use View transaction as your receipt. If confirmation is interrupted, check the saved transaction before sending again.',
    ],
    paragraphs: [
      'The full amount goes directly to the recipient and cannot be cancelled. Direct payments do not appear in the schedule list. For an invoice, choose One-time payment when creating the draft, then use Prepare payment. A successful transfer is linked automatically; the invoice becomes paid after 12 block confirmations.',
      'If the invoice update is interrupted, copy the payment transaction hash from your wallet or saved transaction, then use Link payment transaction beside the invoice. Do not pay again. The transfer must match the invoice owner, recipient and exact amount, and occur after invoice creation. A transfer can settle only one invoice.',
    ],
  },
  {
    id: 'claim-a-payment',
    title: 'Contractor: claim a payment',
    steps: [
      'Open the schedule link from the founder, or connect the recipient wallet and find it in Overview.',
      'Check the sender, recipient, total, start, end, and currently claimable amount. Before the start, nothing is earned yet.',
      'Connect your wallet on Mezo testnet and submit the claim when an amount is available. Confirm the transaction in your wallet.',
      'After confirmation, earned MUSD is transferred to the schedule’s stored recipient. You can claim more later as additional entitlement accrues.',
    ],
    paragraphs: [
      'The contract allows anyone to trigger a claim, but always pays the stored recipient. A different caller cannot redirect the payment. After the end, all remaining unclaimed funding is claimable; there is no need to claim every minute.',
    ],
  },
  {
    id: 'cancellation',
    title: 'Cancellation and a worked example',
    paragraphs: [
      'Only the original sender can cancel, and only before the schedule ends. Cancellation freezes earned entitlement at that moment and refunds only the unearned portion to the sender. Previously claimed funds stay with the recipient, and earned but unpaid funds remain claimable.',
      'Example: a schedule funds 100 MUSD over 100 minutes. Exactly 40 minutes after its start, 40 MUSD has been earned. If the recipient already claimed 15 MUSD and the sender cancels, the sender receives 60 MUSD back and the recipient can still claim 25 MUSD. The recipient’s total payment is 40 MUSD.',
      'Accrual uses chain timestamps and rounds down in the token’s smallest units. Claimable is earned minus already claimed. At the end, the full scheduled amount is earned. The example excludes network fees.',
    ],
  },
  {
    id: 'overview',
    title: 'Reading your overview',
    paragraphs: [
      'The gas reserve cell shows BTC for transaction fees and a separate MEZO network-token balance after token validation. If that optional read fails, MEZO is unavailable; payment funding and claims remain available when their own checks pass.',
      'Overview discovers schedules sent by and received by your connected account, loading up to 20 IDs per direction per page. Use Load more schedules until discovery is complete. A schedule that appears in both directions is displayed once.',
      'Loaded schedules share one source block. The displayed block and timestamp tell you when that snapshot was read. Refresh obtains a fresh snapshot; a failed refresh can leave older results visible with a warning.',
      'Funded obligations count the connected account’s sent schedules only. They represent funding still owed under those schedules, including earned but unpaid amounts after cancellation. Until all pages are loaded, the figure is labelled a partial subtotal.',
    ],
  },
  {
    id: 'runway-planner',
    title: 'Runway planner',
    paragraphs: [
      'Open Borrowing to combine your connected wallet’s current sent schedules, available MUSD and verified loan snapshot. Payroll coverage assumes each current stream renews immediately at its existing rate as its escrow ends. Wallet MUSD pays for renewals; existing escrow cannot be reassigned between recipients. Future-starting schedules are excluded and disclosed separately. Rates round up conservatively.',
      'Planning months are 30 days. Choose 1–24 months, a BTC price drop and a target collateral ratio to compare the full current payment rate with additional borrowing capacity alone. This estimate is separate from the wallet coverage date. Load every schedule on Overview before planning; missing or stale payment data hides coverage, while missing loan health hides only borrowing estimates.',
      'The planner never borrows for you. Open Mezo to manage your loan, or fund a Runway schedule yourself. Estimates exclude borrowing fees, minimum debt, gas compensation on new debt, future interest and system-wide recovery conditions. They use protocol debt accounting of 1 MUSD = 1 USD and are not borrowing quotes.',
    ],
  },
  {
    id: 'receipts',
    title: 'History, receipts, and CSV exports',
    steps: [
      'Open Transaction history & receipts on a schedule to see funding, claims, and cancellation/refund events, oldest first. Event times are shown in UTC.',
      'Load more history when offered. Check the covered block range and snapshot head before treating the list as complete.',
      'Download an event’s JSON receipt for its transaction and event details, or export the loaded history as CSV for a spreadsheet. An export is partial while more history remains to be scanned.',
      'Use the explorer links to inspect the public transaction. Refresh history to include newer transactions beyond the current snapshot.',
    ],
    paragraphs: [
      'Runway receipts are downloadable records of blockchain events. They are not invoices or tax certificates, and an older export does not automatically update after a later payment.',
    ],
  },
  {
    id: 'borrowing',
    title: 'Borrowing overview and BTC scenarios',
    paragraphs: [
      'Open Borrowing in the sidebar to read an existing Mezo testnet position for your connected wallet or an entered public address. The dedicated /borrowing page shows collateral, interest-inclusive debt, the position’s annual rate, and dated loan health when the price and freshness checks pass. A wallet’s MUSD balance is not its loan debt.',
      'Loan management opens in Mezo. Runway currently does not originate loans, add collateral, or repay debt. Funding or claiming a contractor payment does not repay a Mezo loan.',
      'BTC price-drop scenarios are hypothetical. The slider holds snapshot debt and collateral fixed while changing the BTC price to estimate the collateral ratio and threshold price. It does not predict future prices or include future interest, and moving it submits no transaction.',
      'Health and scenarios may be unavailable when data is stale or price checks fail. Refresh and check the position in Mezo before making a borrowing decision.',
    ],
  },
  {
    id: 'troubleshooting',
    title: 'Pending transactions and troubleshooting',
    paragraphs: [
      'Free hosting can pause the workspace and assistant backend after inactivity. A waking notice polls health for up to 90 seconds and offers Retry connection if it remains unavailable. A separate message identifies a database outage. Workspace refreshes after a successful wake; the assistant keeps your question for you to send again and never resends it automatically.',
    ],
    bullets: [
      'Wallet missing: install or unlock a compatible browser wallet, reload, and select the intended wallet from Connect wallet.',
      'Actions disabled: check the account, Mezo testnet network, connection status, and any saved pending transaction. Funding needs MUSD and submitting a transaction needs test BTC.',
      'Approval confirmed but no schedule: approval alone does not fund a payment. Acknowledge the saved result, return to the funding form, and confirm creation with fresh timing.',
      'Transaction pending or no receipt found: check the saved hash in your wallet and explorer. It may be pending, dropped, or replaced. Runway does not automatically resubmit it.',
      'After a reload: the same browser can recover its saved transaction for this deployment. Use Check transaction status, then Acknowledge & refresh when resolved. Tracking is local to this browser, not synced between devices.',
      'Removing saved tracking only removes the browser record; it does not cancel a blockchain transaction. A transaction can still confirm, so check it before submitting another payment.',
      'Nothing claimable: the schedule may not have started, available earnings may already have been claimed, or a cancelled schedule’s earned entitlement may be fully paid. Refresh and inspect the confirmed schedule.',
      'Loading fails: retry the affected schedule or history page. Earlier pages remain visible; check any partial or stale labels before relying on totals.',
    ],
  },
  {
    id: 'assistant',
    title: 'Ask Runway: app and Mezo questions',
    paragraphs: [
      'Open Assistant to ask about Runway, MUSD and Mezo without connecting a wallet. Try a suggested question or type your own, then ask follow-ups. Answers include links to the reviewed documentation and useful app pages. If the reviewed sources do not support an answer, the assistant will say so.',
      'The assistant explains information; it cannot inspect live wallets or transactions, read private invoices, or carry out actions. Use the relevant app page to check current data. Unrelated topics are outside its scope.',
      'Questions are sent to Google Gemini. Do not paste private keys, seed phrases or other secrets. This release keeps the conversation in page memory, not account chat history. New chat clears its context, and reloading clears the conversation. Use Stop to stop waiting for an answer, Retry after a failure, or open the guide when the assistant is unavailable.',
    ],
  },
  {
    id: 'trust-and-limits',
    title: 'What to know about this release',
    paragraphs: [
      'Runway is a testnet prototype. Payment addresses, amounts, timing, and events are public. Sharing a schedule link lets anyone inspect its public payment details; it is not a private invitation.',
      'The payment contract has no schedule editing, administrative withdrawals, upgrades, or Runway payment fees. Network fees still apply. Deposited payment funds do not earn yield. Wallet signatures authorize transactions; Runway never needs your seed phrase or private key.',
      'The deployed payment contract’s source is exact-match verified on the Mezo testnet explorer, and automated contract tests include adversarial and stateful invariant checks. Source verification and testing are not an independent security audit.',
    ],
  },
  {
    id: 'workspace',
    title: 'Workspaces, contractors and draft invoices',
    paragraphs: [
      'Workspace is an additional service that must be configured by the operator. Connect a personal EVM wallet on Mezo testnet, open Workspace and sign the login message. Signing in costs no gas and does not authorize a payment.',
      'Create a workspace, save a contractor name and wallet, then prepare a draft invoice with a MUSD amount, due date and payment type: One-time payment or Payment over time. Workspaces are private to their owner wallet; shared team access and contractor invoice submission are upcoming.',
      'Create payment or Prepare payment opens the funding form with the recipient and, for invoices, amount and an opaque payment reference filled in. Review the recipient and amount before signing. Invoice matches require the original sender, recipient, amount and reference. Repeated funding can create duplicate payments.',
      'When payment indexing is enabled and current, invoices show committed, claimed, refunded and remaining entitlement amounts after a 12-block confirmation buffer. Funded means MUSD is committed; paid means the recipient claimed the full invoice amount. Cancelled invoices show refunds separately. Remaining entitlement includes future accrual and is not necessarily claimable now.',
      'Use Link existing schedule for older payments. Only a confirmed schedule with the same sender, recipient and exact amount can be linked, and a legacy schedule can belong to one invoice. Refresh payment status to check updates. Unavailable means indexing is behind, stale or recovering; check the public schedule before funding again.',
      'Sign out of workspace to revoke your login session. Disconnecting the wallet hides workspace access but does not revoke the server session. Public recipient pages and onchain payment rights do not depend on workspace login.',
    ],
  },
];

export const guideMarkdown =
  [
    '# Runway user guide',
    'Fully funded MUSD contractor payments on Mezo testnet.',
    'Open the app: https://mezo-runway-testnet.vercel.app',
    ...guideSections.flatMap((section) => [
      `## ${section.title}`,
      ...(section.steps?.map((step, index) => `${index + 1}. ${step}`) ?? []),
      ...(section.paragraphs ?? []),
      ...(section.bullets?.map((bullet) => `- ${bullet}`) ?? []),
    ]),
  ].join('\n\n') + '\n';
