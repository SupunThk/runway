import { expect, test, type Page } from '@playwright/test';

// EIP-1193/6963 test doubles only. No extension, signing or real transactions are involved.
async function installWallets(
  page: Page,
  announce = true,
  reject = false,
  setup: {
    missingChain?: boolean;
    rejectSetup?: boolean;
    unsupportedToken?: boolean;
    watchResult?: boolean;
  } = {},
) {
  await page.addInitScript(
    ({ announce, reject, setup }) => {
      const calls: { wallet: string; method: string; params?: unknown }[] = [];
      Object.assign(window, { walletTestCalls: calls });
      const makeProvider = (name: string, account: string) => {
        let connected = false;
        let networkKnown = !setup.missingChain;
        let chainId = setup.missingChain ? '0x1' : '0x7b7b';
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
          async request({
            method,
            params,
          }: {
            method: string;
            params?: unknown;
          }) {
            calls.push({ wallet: name, method, params });
            if (method === 'eth_chainId')
              return (
                (window as unknown as { walletTestChainOverride?: string })
                  .walletTestChainOverride ?? chainId
              );
            if (
              method === 'wallet_switchEthereumChain' ||
              method === 'wallet_addEthereumChain'
            ) {
              if (setup.rejectSetup)
                throw Object.assign(new Error('User rejected request.'), {
                  code: 4001,
                });
              if (method === 'wallet_addEthereumChain') {
                networkKnown = true;
                return null;
              }
              if (!networkKnown)
                throw Object.assign(new Error('Unknown chain.'), {
                  code: 4902,
                });
              chainId = '0x7b7b';
              listeners
                .get('chainChanged')
                ?.forEach((listener) => listener(chainId));
              return null;
            }
            if (method === 'wallet_watchAsset') {
              if (setup.unsupportedToken)
                throw Object.assign(new Error('Unsupported method.'), {
                  code: 4200,
                });
              return setup.watchResult ?? true;
            }
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
    { announce, reject, setup },
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

test('wallet setup adds a missing chain, switches, and imports MUSD only through the selected wallet', async ({
  page,
}) => {
  await installWallets(page, true, false, { missingChain: true });
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Connect wallet', exact: true })
    .click();
  await page.getByRole('button', { name: 'MetaMask', exact: true }).click();
  await page.getByRole('button', { name: 'Wallet setup', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Wallet setup', exact: true });
  await expect(
    panel.getByRole('button', { name: 'Add MUSD to wallet' }),
  ).toBeDisabled();
  await panel
    .getByRole('button', { name: 'Add / switch Mezo testnet' })
    .click();
  await expect(panel.getByRole('status')).toContainText(
    'Mezo testnet selected',
  );
  await panel.getByRole('button', { name: 'Add MUSD to wallet' }).click();
  await expect(panel.getByRole('status')).toContainText(
    'MUSD request accepted',
  );
  const calls = await page.evaluate(
    () =>
      (
        window as unknown as {
          walletTestCalls: {
            wallet: string;
            method: string;
            params: unknown;
          }[];
        }
      ).walletTestCalls,
  );
  expect(
    calls
      .filter(
        (call) =>
          call.method.startsWith('wallet_') &&
          /Chain|watchAsset/.test(call.method),
      )
      .map((call) => call.wallet),
  ).toEqual(['MetaMask', 'MetaMask', 'MetaMask', 'MetaMask']);
  expect(
    calls.find((call) => call.method === 'wallet_addEthereumChain')?.params,
  ).toEqual([
    {
      chainId: '0x7b7b',
      chainName: 'Mezo Testnet',
      nativeCurrency: { name: 'Bitcoin', symbol: 'BTC', decimals: 18 },
      rpcUrls: ['https://rpc.test.mezo.org'],
      blockExplorerUrls: ['https://explorer.test.mezo.org'],
    },
  ]);
  expect(
    calls.find((call) => call.method === 'wallet_watchAsset')?.params,
  ).toEqual({
    type: 'ERC20',
    options: {
      address: '0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503',
      symbol: 'MUSD',
      decimals: 18,
    },
  });
  expect(
    calls.some((call) =>
      /sendTransaction|sign|sendRawTransaction/i.test(call.method),
    ),
  ).toBe(false);
  await page.screenshot({
    path: '.tools/wallet-setup-desktop.png',
    fullPage: true,
  });
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Wallet setup', exact: true }),
  ).toBeFocused();
});

test('token import rechecks the selected provider network before prompting', async ({
  page,
}) => {
  await installWallets(page);
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Connect wallet', exact: true })
    .click();
  await page.getByRole('button', { name: 'Rabby', exact: true }).click();
  await page.getByRole('button', { name: 'Wallet setup', exact: true }).click();
  await page.evaluate(() =>
    Object.assign(window, { walletTestChainOverride: '0x1' }),
  );
  await page.getByRole('button', { name: 'Add MUSD to wallet' }).click();
  await expect(
    page.getByRole('region', { name: 'Wallet setup' }).getByRole('status'),
  ).toContainText('Switch to Mezo testnet before adding MUSD.');
  expect(
    await page.evaluate(() =>
      (
        window as unknown as { walletTestCalls: { method: string }[] }
      ).walletTestCalls.some((call) => call.method === 'wallet_watchAsset'),
    ),
  ).toBe(false);
});

for (const scenario of [
  'unsupported',
  'declined',
  'network-rejected',
] as const) {
  test(`wallet setup handles ${scenario} and retains manual settings`, async ({
    page,
  }) => {
    await installWallets(page, true, false, {
      unsupportedToken: scenario === 'unsupported',
      watchResult: scenario !== 'declined',
      rejectSetup: scenario === 'network-rejected',
    });
    await page.setViewportSize({ width: 320, height: 844 });
    await page.goto('/workspace');
    await page
      .getByRole('button', { name: 'Connect wallet', exact: true })
      .click();
    await page.getByRole('button', { name: 'Rabby', exact: true }).click();
    await page
      .getByRole('button', { name: 'Wallet setup', exact: true })
      .click();
    const panel = page.getByRole('region', {
      name: 'Wallet setup',
      exact: true,
    });
    await panel
      .getByRole('button', {
        name:
          scenario === 'network-rejected'
            ? 'Add / switch Mezo testnet'
            : 'Add MUSD to wallet',
      })
      .click();
    await expect(panel.getByRole('status')).toContainText(
      scenario === 'network-rejected'
        ? 'Request declined'
        : scenario === 'declined'
          ? 'MUSD was not added'
          : 'could not complete setup',
    );
    await panel
      .getByText('Manual network & token settings', { exact: true })
      .click();
    await expect(panel.getByText('31611', { exact: true })).toBeVisible();
    await expect(
      panel.getByText('0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503', {
        exact: true,
      }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const bounds = await panel.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320);
    if (scenario === 'unsupported')
      await page.screenshot({
        path: '.tools/wallet-setup-mobile.png',
        fullPage: true,
      });
  });
}
