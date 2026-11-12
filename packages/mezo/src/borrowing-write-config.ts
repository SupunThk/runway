import { getAddress, parseAbi } from 'viem';

// aa25fd6 official matsnet artifacts, RPC identities checked 2026-11-01.
// See deployments/mezo-testnet.borrowing-write-verification.json. Not an audit.
export const borrowingWriteDeployment = {
  operations: {
    address: getAddress('0xCdF7028ceAB81fA0C6971208e83fa7872994beE5'),
    implementation: getAddress('0xc05Bf344BD5b58825784326dD3112fB6cC160dcC'),
    codeHash:
      '0x87a175620a5e54bb59b8c80ed45631f94e2b03afbd7f062e58ce6451546862f5',
  },
  hints: {
    address: getAddress('0x4e4cBA3779d56386ED43631b4dCD6d8EacEcBCF6'),
    implementation: getAddress('0x8adF3f35dBE4026112bCFc078872bcb967732Ea8'),
    codeHash:
      '0x49ea863431f90f85807b0662b81193bd990bfbede3dacc463cfb304509c403a9',
  },
  sorted: {
    address: getAddress('0x722E4D24FD6Ff8b0AC679450F3D91294607268fA'),
    implementation: getAddress('0x9177DF58A9614b84C8c2F68dF27506AB9a5d0323'),
    codeHash:
      '0x43bff0fd0784eda713080b177391e9099feae87e3ff48e5d0a418a07d00af9d0',
  },
  interest: {
    address: getAddress('0xD4D6c36A592A2c5e86035A6bca1d57747a567f37'),
    implementation: getAddress('0xAA13B1d9CFFA3F44ab3A8BE0dC8774FB7841459C'),
    codeHash:
      '0x9a5ef56ce2bbe0da3b73e9bf0e23ae0824274aa021ea57581e83df32b4275e8d',
  },
  governance: {
    address: getAddress('0x6552059B6eFc6aA4AE3ea45f28ED4D92acE020cD'),
    implementation: getAddress('0x4EDC83c5C5B0C41A594371485554B95280653f94'),
    codeHash:
      '0xaabf43f84a2083090ff3bbfaf792562a0c8ef963fdf9c2946fa5944ee9aae1c1',
  },
} as const;
export const borrowerOperationsAbi = parseAbi([
  'function openTrove(uint256,address,address) payable',
  'function addColl(address,address) payable',
  'function withdrawMUSD(uint256,address,address)',
  'function adjustTrove(uint256,uint256,bool,address,address) payable',
  'function repayMUSD(uint256,address,address)',
  'function musd() view returns (address)',
  'function troveManager() view returns (address)',
  'function priceFeed() view returns (address)',
  'function sortedTroves() view returns (address)',
  'function interestRateManager() view returns (address)',
  'function governableVariables() view returns (address)',
  'function borrowingRate() view returns (uint256)',
  'function minNetDebt() view returns (uint256)',
  'function MCR() view returns (uint256)',
  'function CCR() view returns (uint256)',
  'function MUSD_GAS_COMPENSATION() view returns (uint256)',
  'function getEntireSystemColl() view returns (uint256)',
  'function getEntireSystemDebt() view returns (uint256)',
]);
export const borrowingSystemAbi = parseAbi([
  'function getTroveStatus(address) view returns (uint8)',
  'function getEntireDebtAndColl(address) view returns (uint256,uint256,uint256,uint256,uint256,uint256)',
  'function getTroveMaxBorrowingCapacity(address) view returns (uint256)',
  'function getTroveInterestRate(address) view returns (uint16)',
  'function getTCR(uint256) view returns (uint256)',
  'function checkRecoveryMode(uint256) view returns (bool)',
  'function musdToken() view returns (address)',
  'function priceFeed() view returns (address)',
  'function borrowerOperations() view returns (address)',
]);
export const hintHelpersAbi = parseAbi([
  'function troveManager() view returns (address)',
  'function borrowerOperations() view returns (address)',
  'function sortedTroves() view returns (address)',
  'function getApproxHint(uint256,uint256,uint256) view returns (address,uint256,uint256)',
]);
export const sortedTrovesAbi = parseAbi([
  'function troveManager() view returns (address)',
  'function borrowerOperationsAddress() view returns (address)',
  'function findInsertPosition(uint256,address,address) view returns (address,address)',
]);
export const interestManagerAbi = parseAbi([
  'function getAccruedInterest() view returns (uint256)',
  'function interestRate() view returns (uint16)',
]);
export const governableVariablesAbi = parseAbi([
  'function isAccountFeeExempt(address) view returns (bool)',
]);
