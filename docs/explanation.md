# Understanding Mezo, borrowing, lending, and your Runway payment app

This guide explains what you are testing, what the wallets and coins do, and what happens when you click the buttons. It reflects the project and the recorded test on October 10, 2026. Recorded balances below are snapshots, not live balances.

## 1. What are we building?

We are building **Runway**, an app for paying someone MUSD gradually over a period of time. Think of a contractor earning their agreed payment as time passes.

The sender deposits the entire payment into a smart contract at the beginning. The recipient can then collect the portion they have earned. The contract is a program on the blockchain that enforces these rules.

For example: deposit 1 MUSD for a five-minute test. The recipient earns 0.2 MUSD per minute, up to 1 MUSD in total.

Runway currently does **payments**. It does not currently lend money, create loans, repay loans, or earn interest on deposited money. Mezo's borrowing service is a separate system that can supply the MUSD someone later uses for payments.

## 2. What are BTC, MUSD, and MEZO?

| Asset | What it means in this test | What you use it for |
| --- | --- | --- |
| BTC | The native asset on the Mezo network | Paying transaction fees; it can also be used as borrowing collateral |
| MUSD | A stablecoin designed to track one US dollar | Funding schedules and paying the recipient |
| MEZO | A separate token | Your current Runway payment flow does not use it |

You are using **Mezo testnet**. These test assets are for testing; they are not ordinary spendable real BTC or dollars. You do not need to buy or bridge real assets to finish this test.

MUSD's dollar target does not mean a guaranteed price or a bank deposit. On testnet, “1 MUSD” is a useful test amount, not a promise that you can withdraw one real dollar.

Your wallet must select the correct network:

| Setting | Value |
| --- | --- |
| Network | Mezo Testnet |
| Chain ID | `31611` |
| RPC | `https://rpc.test.mezo.org` |
| Explorer | `https://explorer.test.mezo.org` |
| Gas currency | BTC |

Mezo supports Ethereum-style `0x...` addresses. Your Mezo BTC balance is on Mezo; do not confuse this with sending BTC on the native Bitcoin network. See [Mezo's network documentation](https://mezo.org/docs/developers/getting-started/).

### Showing tokens in Brave Wallet

| Token | Mezo testnet contract address | Decimals |
| --- | --- | --- |
| MUSD | `0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503` | 18 |
| MEZO | `0x7B7c000000000000000000000000000000000001` | 18 |

These token details were verified during this project. BTC is the native gas asset, so it does not need an ERC-20 token import.

**Importing a token only tells the wallet to display it.** It does not create coins, transfer money, or change the network where your coins exist.

## 3. Why do you have two wallet addresses?

You are playing both sides of a payment test:

| Role | Address | Job |
| --- | --- | --- |
| Founder / sender | `0x1ac891Ce491851AC87851D62B9184c75A76f55cF` | Funds the payment schedule |
| Contractor / recipient | `0x99d7a7dcf20a0ac9fc3D03Cd90b0a1F4BC561b09` | Receives the earned MUSD |

“Founder” and “contractor” are labels for this demonstration. You control both accounts. Moving money between them tests the app; it does not create extra money.

The sender needs MUSD to fund payments and a little test BTC for gas. The recipient can start with zero MUSD. If the recipient submits a claim transaction, that account needs a little test BTC for gas too.

Brave Wallet, Rabby, and MetaMask are interfaces for controlling accounts. The network, selected account, and contract address determine which funds and application you are using.

## 4. Borrowing, lending, and paying are different things

| Action | Simple meaning | Example |
| --- | --- | --- |
| Borrow | Receive money now with an obligation to repay | Receive MUSD against BTC collateral |
| Lend | Supply money under terms that allow someone else to borrow it | Lend 100 units and expect repayment, possibly with interest |
| Pay | Give someone money for work, goods, or another obligation | Pay a contractor 1 MUSD |
| Swap | Exchange one asset for another | Exchange a token for MUSD; the exchange itself is not a loan |

If you lend to someone, you are the lender and they are the borrower. Interest paid by the borrower can be income for the lender. In a protocol, the relationship may use pools and automated rules instead of a direct agreement between two people.

Supplying tokens to a lending pool, depositing into a trading liquidity pool, and funding a payment contract are different activities. They have different rules and risks. A deposit does not automatically earn interest.

**Your Runway deposit earns no yield.** It reserves money to pay the recipient. The contractor is being paid, not borrowing from the founder, and does not owe that payment back under the schedule.

## 5. How borrowing against BTC works

Imagine you own BTC and want MUSD without selling that BTC immediately. A collateralized borrowing system lets you lock BTC and receive MUSD against it.

The basic terms are:

- **Collateral:** the asset locked to support the loan, such as BTC.
- **Principal:** the amount borrowed, before additional charges.
- **Debt:** the total amount you owe, including applicable interest and charges.
- **Interest:** the cost of borrowing over time.
- **Repayment:** returning the required amount to reduce or close the debt.
- **Liquidation:** the protocol taking or selling collateral according to its rules when a position becomes insufficiently collateralized.

Borrowing gives you spendable funds **and** a debt. It does not create free income. Keeping ownership exposure to BTC also means its price can move against your borrowing position.

### Mezo's borrowing flow

Mezo lets users deposit BTC collateral and mint MUSD against it. “Mint” means create tokens through the protocol; it is not Bitcoin mining.

The official guide currently describes a minimum opening loan of **1,800 MUSD borrowed plus a 200 MUSD gas deposit**, giving at least **2,000 MUSD opening debt**. That minimum is an MUSD borrowing requirement, not a fixed amount of BTC collateral. Review the actual position and quote in Mezo. See [Mezo's borrowing guide](https://mezo.org/docs/users/borrow/mint-musd/).

The protocol's 200 MUSD gas deposit is separate from the small BTC network fee you pay to send a transaction. Mezo documents the deposit as returned when closing the position; use its closing screen to check the actual calculation and required balances. See [Mezo's fees documentation](https://mezo.org/docs/users/borrow/fees/).

You reported having **0.015 BTC and 1,800 MUSD**. That balance alone does not prove whether you borrowed, how much collateral you locked, or what you owe. If you obtained the MUSD through Mezo Borrow, inspect the position at [Mezo testnet Borrow](https://testnet.mezo.org/feature/borrow) using the account that opened it.

Check the displayed collateral, total debt, interest rate, collateral ratio, and repayment requirements. We have not verified your actual borrowing position, so this guide does not assign you a specific debt or interest rate.

## 6. Why collateral value matters

Here is an invented example using dollar values, not your actual account:

| Situation | BTC collateral value | Debt | Collateral ratio | Loan-to-value |
| --- | --- | --- | --- | --- |
| Initially | $5,000 | $2,000 | 250% | 40% |
| After BTC falls | $3,000 | $2,000 | 150% | About 66.7% |

The formulas are:

```text
Collateral ratio = collateral value / debt × 100
Loan-to-value (LTV) = debt / collateral value × 100
```

A higher collateral ratio means more collateral backing each unit of debt. A higher LTV means more debt relative to the collateral. Falling BTC prices or growing debt can make the position less healthy.

Actual liquidation conditions depend on the protocol's rules and state; the example's numbers are not liquidation thresholds. Mezo also has **redemptions**, where MUSD is exchanged against protocol collateral and affected positions have debt and collateral reduced. A redemption is different from liquidation and can affect a position that is otherwise healthy. See [Mezo's liquidation and redemption mechanics](https://mezo.org/docs/users/borrow/liquidation-mechanics/).

## 7. How borrowing and Runway fit together

```text
Your BTC collateral
        |
        v
Mezo borrowing position ---- creates a repayment obligation for you
        |
        v
MUSD in founder wallet
        |
        | Fund the entire agreed payment
        v
Runway payment contract
        |
        | Recipient earns over time; someone submits a claim
        v
MUSD in contractor wallet
```

The top borrowing step is optional for Runway. If you already have MUSD from another source, you can use it to fund a schedule.

**Paying the contractor does not repay a Mezo loan.** If the founder borrowed the MUSD, the founder still owes that borrowing debt after paying the contractor. The contractor does not inherit the founder's debt.

To repay, use Mezo's borrowing interface and its required repayment transaction. Closing a loan can require MUSD for the debt and applicable interest or fees. Sending tokens to your other wallet or back to Runway is not loan repayment.

The BTC collateral in Mezo and the MUSD reserved in Runway are held by separate contracts. Runway does not check your loan health, add collateral, or manage your repayment.

## 8. What each wallet action means

### Connect wallet

Connecting lets the site see your selected public account and request actions. Connection alone does not transfer funds. The selected account matters: check it before each transaction.

### Deploy contract

Deployment puts the payment program on the blockchain. You already deployed:

`0x01A1662F2EB6C15Bfb2c8fd010c53c9055478b7D`

[View the payment contract](https://explorer.test.mezo.org/address/0x01A1662F2EB6C15Bfb2c8fd010c53c9055478b7D).

Deployment used test BTC for gas. It did not create a loan or deposit all your MUSD. You can use this same contract for multiple schedules; you do not deploy again for every payment.

The deployment was checked against the local compiled contract and its configured MUSD address. This is not a security audit or a claim that its source has been verified on the explorer.

### Approve MUSD

Approval gives a specified contract permission to spend up to a token allowance from your account. For a 1 MUSD schedule, an approval can authorize that amount. Approval itself does not deposit the payment; it authorizes a later transfer.

Check the token, spender address, and amount in the wallet prompt. Approval is a real permission, even though it is a separate step from funding.

### Create schedule

Creation records the recipient, amount, start, and end. It transfers the full amount from the sender into the contract. If creation fails, it does not leave a partially funded schedule.

After successful funding, that amount is reserved in the contract and no longer available to spend from the sender's wallet. The recipient address cannot be edited afterward.

### Claim

A claim transfers the earned, unpaid amount from the contract to the stored recipient. Anyone may trigger this contract's claim function, but the payment always goes to that recipient. The account submitting the transaction pays its BTC gas fee.

**Time passing makes money claimable; it does not send transactions automatically.** A wallet transaction is still needed to collect it. Reading balances normally needs no gas; sending transactions does.

## 9. How gradual payments work

For a 1 MUSD schedule lasting five minutes:

| Time since start | Total earned | Already collected in this example | Available to claim |
| --- | --- | --- | --- |
| Before start | 0 | 0 | 0 |
| Two minutes | 0.4 | 0 | 0.4 |
| Three minutes, after claiming at minute two | 0.6 | 0.4 | 0.2 |
| Five minutes, after those two claims | 1 | 0.6 | 0.4 |

“Vested” means earned under the schedule. “Claimed” means already transferred to the recipient. “Claimable” means earned but not yet transferred.

```text
Claimable = total earned so far − already claimed
```

The contract calculates progress using blockchain timestamps. It does not double-pay an earlier claim, and it stops earning at the agreed total. Small rounding differences can appear during accrual because token amounts use whole smallest units.

## 10. What happened in your actual test?

Your recipient page is:

`http://127.0.0.1:5173/schedules/1`

Schedule 1 reserved **1 MUSD** from your founder address for your contractor address. Its start was **October 10, 2026, at 6:41:13 PM Sri Lanka time**, and its end was **6:46:13 PM** that day. The five-minute duration runs between those timestamps, not from the first button click.

At the recorded check, blockchain time **6:44:40 PM Sri Lanka time**, we verified:

| Item | Amount |
| --- | --- |
| Original payment | 1 MUSD |
| Already paid through two claims | 0.46 MUSD |
| Contractor wallet balance | 0.46 MUSD |
| Still in the payment contract | 0.54 MUSD |
| Earned but not yet claimed at that moment | 0.23 MUSD |
| Not yet earned at that moment | 0.31 MUSD |

The two claims paid 0.19 and 0.27 MUSD. At that snapshot, the accounting was:

```text
1 MUSD deposited = 0.46 paid + 0.54 still reserved
0.54 reserved = 0.23 earned but unpaid + 0.31 not yet earned
```

These are historical numbers from the initial partial-claim check. A later check confirmed that the final 0.54 MUSD was claimed: schedule 1 is now complete with 1 MUSD claimed and zero claimable. The updated evidence is saved in [deployments/schedule-1.check.json](../deployments/schedule-1.check.json).

Your second, cancelled schedule has also settled. Its recipient earned and claimed 0.628333333333333333 MUSD, and its cancellation refunded 0.371666666666666667 MUSD to the sender. Zero remains claimable. See [schedule 2 evidence](../deployments/schedule-2.check.json). These checks found the contractor holding 1.628333333333333333 MUSD in total and the payment contract holding zero MUSD.

## 11. What happens if the sender cancels?

Only the original sender can cancel, and only before the schedule ends. Cancellation stops further earning:

- The sender receives the portion that has not yet been earned.
- The recipient keeps amounts already paid.
- Earned but unpaid money remains reserved for the recipient to claim.

Example: cancel a 1 MUSD, five-minute schedule exactly two minutes after its start. The recipient has earned 0.4 MUSD. If they already claimed 0.1 MUSD, the sender gets 0.6 MUSD back, and 0.3 MUSD remains claimable by the recipient.

Before the start, nothing has been earned, so cancellation refunds the full payment. At or after the end, the sender cannot cancel to recover the recipient's earned money.

## 12. What should you do next?

1. Open the published app at `https://mezo-runway-testnet.vercel.app/schedules/1` and select Mezo Testnet. The steps below describe how to collect any unpaid schedule; your first two schedules have already settled.
2. Connect your contractor account and check the displayed recipient address matches it.
3. Read the current claimed and claimable amounts. If money remains claimable, use **Claim** and review the wallet transaction. The submitting account needs a little test BTC.
4. After confirmation, check the contractor's MUSD balance and the schedule's remaining claimable amount. For an uncancelled, completed 1 MUSD schedule, total claims should reach 1 MUSD.
5. Separately, if you borrowed the MUSD, open Mezo Borrow with the borrowing account and understand that position's debt and collateral. Completing the payment test does not close that position.

For a separate cancellation test, use a new small schedule with a future end and cancel it before that end. The original five-minute schedule's end has already passed.

The address `127.0.0.1` means **this computer**. Sending that local link to someone on another computer will not open your app for them. The frontend is now publicly hosted at **https://mezo-runway-testnet.vercel.app**. Share links from that host, such as `/schedules/2`, for another person to open. The public site uses the same testnet contract and schedules. If the local development server is stopped, the public site can still load.

## 13. What is working, and what remains?

Working in this version: wallet connection, MUSD approval, fully funded schedule creation, gradual earning, claims to a fixed recipient, and cancellation rules. Contract, calculation, and browser tests have passed; the deployment and the partial claims above were also checked on testnet.

Still outside this version: borrowing or repayment inside Runway, lending or yield, automatic claims, and a verified borrowing-position dashboard. Public frontend hosting, full-payment settlement, and cancellation settlement have now been completed. Broader security testing remains work to finish. Passing tests does not make this an audited production financial product.

The payment rules are in [contracts/src/RunwayPayments.sol](../contracts/src/RunwayPayments.sol), and the intended scope is in [docs/product-scope.md](product-scope.md).

## 14. The three balances to keep separate

When looking at this system, ask three different questions:

1. **What can I spend now?** Your wallet's available tokens.
2. **What have I reserved to pay someone?** Money deposited in payment schedules, some of which may already belong to the recipient under their earning rules.
3. **What do I owe?** Any borrowing debt, which may include interest and charges.

An MUSD wallet balance answers the first question. It does not answer the other two. Borrowed money is spending power with a repayment obligation; paying your other test account changes where the tokens are held, not how much wealth the two accounts have together.
