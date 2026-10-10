import { expect, test, type Page } from '@playwright/test';

// EIP-1193/6963 test doubles only. No extension, signing or real transactions are involved.
async function installWallets(page: Page, announce = true, reject = false) {
  await page.addInitScript(
    ({ announce, reject }) => {
      const calls: { wallet: string; method: string }[] = [];
      Object.assign(window, { walletTestCalls: calls });
      const makeProvider = (name: string, account: string) => {
        let connected = false;
        const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
        return {
          isMetaMask: true,
          isRabby: name === 'Rabby',
          on(event: string, listener: (...args: unknown[]) => void) {
            if (!listeners.has(event)) listeners.set(event, new Set());
            listeners.get(event)!.add(listener);
          },
          removeListener(
            event: string,
            listener: (...args: unknown[]) => void,
          ) {
            listeners.get(event)?.delete(listener);
          },
          async request({ method }: { method: string }) {
            calls.push({ wallet: name, method });
            if (method === 'eth_chainId') return '0x7b7b';
            if (method === 'eth_accounts') return connected ? [account] : [];
            if (method === 'wallet_requestPermissions') {
              if (reject)
                throw Object.assign(new Error('User rejected request.'), {
                  code: 4001,
                });
              return [];
            }
            if (method === 'eth_requestAccounts') {
              connected = true;
              return [account];
            }
            if (method === 'wallet_revokePermissions') {
              connected = false;
              return null;
            }
            throw Object.assign(
              new Error(`Unsupported test method: ${method}`),
              { code: 4200 },
            );
          },
        };
      };
      const rabby = makeProvider(
        'Rabby',
        '0x0000000000000000000000000000000000000011',
      );
      const metamask = makeProvider(
        'MetaMask',
        '0x0000000000000000000000000000000000000022',
      );
      Object.assign(window, {
        ethereum: Object.assign(rabby, { providers: [rabby, metamask] }),
      });
      if (announce) {
        const announceWallets = () => {
          for (const [name, rdns, uuid, provider] of [
            [
              'Rabby',
              'io.rabby',
              '9b583e83-ceb5-4c6f-a2d8-8e8fbcde1011',
              rabby,
            ],
            [
              'MetaMask',
              'io.metamask',
              '9b583e83-ceb5-4c6f-a2d8-8e8fbcde1022',
              metamask,
            ],
          ] as const)
            window.dispatchEvent(
              new CustomEvent('eip6963:announceProvider', {
                detail: {
                  info: {
                    name,
                    rdns,
                    uuid,
                    icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>',
                  },
                  provider,
                },
              }),
            );
        };
        window.addEventListener('eip6963:requestProvider', announceWallets);
        announceWallets();
      }
    },
    { announce, reject },
  );
}

for (const wallet of ['Rabby', 'MetaMask']) {
  test(`selects ${wallet} when both wallets are installed`, async ({
    page,
  }) => {
    await installWallets(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Connect wallet' }).click();
    const picker = page.getByRole('group', { name: 'Choose wallet' });
    await expect(
      picker.getByRole('button', { name: 'Rabby', exact: true }),
    ).toHaveCount(1);
    await expect(
      picker.getByRole('button', { name: 'MetaMask', exact: true }),
    ).toHaveCount(1);
    await expect(
      picker.getByRole('button', { name: 'Browser wallet', exact: true }),
    ).toHaveCount(0);
    await picker.getByRole('button', { name: wallet, exact: true }).click();
    await expect(
      page.getByRole('button', { name: new RegExp(`${wallet}.*Disconnect`) }),
    ).toBeVisible();
    const calls = await page.evaluate(
      () =>
        (
          window as unknown as {
            walletTestCalls: { wallet: string; method: string }[];
          }
        ).walletTestCalls,
    );
    expect(
      calls
        .filter((call) => call.method === 'eth_requestAccounts')
        .map((call) => call.wallet),
    ).toEqual([wallet]);
    await page.getByRole('button', { name: /Disconnect/ }).click();
    await expect(
      page.getByRole('button', { name: 'Connect wallet' }),
    ).toBeVisible();
  });
}

test('legacy Rabby injection is selectable without EIP-6963 announcements', async ({
  page,
}) => {
  await installWallets(page, false);
  await page.goto('/');
  await page.getByRole('button', { name: 'Connect wallet' }).click();
  await page.getByRole('button', { name: 'Rabby', exact: true }).click();
  await expect(
    page.getByRole('button', { name: /Rabby.*Disconnect/ }),
  ).toBeVisible();
});

test('rejected wallet connection keeps the picker usable', async ({ page }) => {
  await installWallets(page, true, true);
  await page.goto('/');
  await page.getByRole('button', { name: 'Connect wallet' }).click();
  await page.getByRole('button', { name: 'Rabby', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('User rejected');
  await expect(
    page.getByRole('button', { name: 'Rabby', exact: true }),
  ).toBeEnabled();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('group', { name: 'Choose wallet' })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole('button', { name: 'Connect wallet' }),
  ).toBeFocused();
});
