# Mezo Runway — initial scope

Implementation began October 10, 2026 at the user's request. Organizer permission for pre-build implementation has not been confirmed. Record this work accurately in any submission.

- Mezo testnet only; official MUSD is the settlement asset. BTC pays gas.
- Immutable recipient, full upfront funding, linear accrual in integer base units.
- Anyone may trigger a claim; funds always go to the stored recipient.
- Only the sender may cancel. Return only unvested funding; preserve unpaid vested entitlement.
- Cancellation at or after the end is rejected as unnecessary.
- No upgrades, administrative withdrawals, fees, arbitrary token selection, or recipient edits.
- Rabby and MetaMask have explicit legacy connectors; EIP-6963 discovery lists other installed EVM browser wallets. The user selects the wallet explicitly. Passport and remote/QR connectors remain deferred.
- Borrowing is read-only: verified position/interest/oracle reads are implemented locally, with loan management opening Mezo. See [borrowing integration](borrowing.md).
- Vercel hosts the public testnet frontend, with GitHub-driven source builds. History, JSON receipts, CSV exports and pending-transaction recovery are deployed.
- Use deployed MUSD through standard interfaces. No MUSD implementation source was copied. OpenZeppelin 5.0.2 utilities are reused under MIT; preserve its license with published source.

The overview discovers at most 100 sent and 100 received schedules. Direct links can read other schedule IDs. Full schedule pagination, publishing the local borrowing view and borrowing price-stress scenarios remain implementation tasks. History scans are paginated separately and disclose their covered range.
