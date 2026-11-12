// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

interface ForkVm {
    function envOr(string calldata, bool) external returns (bool);
    function envBytes(string calldata) external returns (bytes memory);
    function skip(bool) external;
    function deal(address, uint256) external;
    function prank(address) external;
    function warp(uint256) external;
    function load(address, bytes32) external view returns (bytes32);
    function mockCall(address, bytes calldata, bytes calldata) external;
}
interface ForkToken {
    function balanceOf(address) external view returns (uint256);
    function allowance(address, address) external view returns (uint256);
    function approve(address, uint256) external returns (bool);
}
interface ForkBorrowing {
    function musd() external view returns (address);
    function borrowingRate() external view returns (uint256);
    function MUSD_GAS_COMPENSATION() external view returns (uint256);
    function openTrove(uint256, address, address) external payable;
    function addColl(address, address) external payable;
    function withdrawMUSD(uint256, address, address) external;
    function repayMUSD(uint256, address, address) external;
}
interface ForkManager {
    function getTroveStatus(address) external view returns (uint8);
    function getTroveMaxBorrowingCapacity(address) external view returns (uint256);
    function getEntireDebtAndColl(address) external view returns (uint256, uint256, uint256, uint256, uint256, uint256);
}
interface ForkPayments {
    struct Schedule { address sender; address recipient; uint256 total; uint64 start; uint64 end; uint256 claimed; bool cancelled; uint256 vestedAtCancellation; bytes32 referenceHash; }
    function musd() external view returns (address);
    function outstandingObligations() external view returns (uint256);
    function createSchedule(address, uint256, uint64, uint64, bytes32) external returns (uint256);
    function getSchedule(uint256) external view returns (Schedule memory);
    function claim(uint256) external;
}

// Runs only in the isolated harness. No signed or broadcast network transaction.
// Mezo's native oracle is not an Ethereum precompile: the harness supplies its
// actual response from this exact fork block, disclosed in the evidence report.
contract MezoForkTest {
    ForkVm constant vm = ForkVm(address(uint160(uint256(keccak256("hevm cheat code")))));
    address constant OPERATIONS = 0xCdF7028ceAB81fA0C6971208e83fa7872994beE5;
    address constant IMPLEMENTATION = 0xc05Bf344BD5b58825784326dD3112fB6cC160dcC;
    address constant MANAGER = 0xE47c80e8c23f6B4A1aE41c34837a0599D5D16bb0;
    address constant MUSD = 0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503;
    address constant PAYMENTS = 0x01A1662F2EB6C15Bfb2c8fd010c53c9055478b7D;
    address constant ORACLE = 0x7b7c000000000000000000000000000000000015;
    bytes32 constant SLOT = 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;

    function debt(address actor) internal view returns (uint256 value) {
        (, value,,,,) = ForkManager(MANAGER).getEntireDebtAndColl(actor);
    }
    function testForkBorrowTopUpRepayFundAndClaim() public {
        if (!vm.envOr("RUNWAY_FORK_ENABLED", false)) vm.skip(true);
        require(block.chainid == 31611, "fork network mismatch");
        require(address(uint160(uint256(vm.load(OPERATIONS, SLOT)))) == IMPLEMENTATION, "implementation changed");
        require(IMPLEMENTATION.codehash == 0x87a175620a5e54bb59b8c80ed45631f94e2b03afbd7f062e58ce6451546862f5, "implementation bytecode changed");
        require(PAYMENTS.codehash == 0xc7eb8df864b38e1d68e27564eaeeeff4f8d5058391ef873a7ef673bdaee4a0c2, "payment bytecode changed");
        vm.mockCall(ORACLE, abi.encodeWithSignature("latestRoundData()"), vm.envBytes("RUNWAY_FORK_ORACLE_ROUND"));
        vm.mockCall(ORACLE, abi.encodeWithSignature("decimals()"), vm.envBytes("RUNWAY_FORK_ORACLE_DECIMALS"));
        ForkBorrowing borrowing = ForkBorrowing(OPERATIONS);
        ForkToken token = ForkToken(MUSD);
        ForkPayments payments = ForkPayments(PAYMENTS);
        require(borrowing.musd() == MUSD && payments.musd() == MUSD, "token binding mismatch");
        address actor = address(uint160(uint256(keccak256("RUNWAY_ISOLATED_FORK_ACTOR_20261103"))));
        address recipient = address(uint160(uint256(keccak256("RUNWAY_ISOLATED_FORK_RECIPIENT_20261103"))));
        require(ForkManager(MANAGER).getTroveStatus(actor) == 0, "fork actor already used");
        vm.deal(actor, 3 ether);
        uint256 beforeBalance = token.balanceOf(actor);
        vm.prank(actor); borrowing.openTrove{value: 1 ether}(2000 ether, address(0), address(0));
        require(token.balanceOf(actor) == beforeBalance + 2000 ether, "opening proceeds mismatch");
        uint256 openedDebt = debt(actor);
        require(openedDebt >= 2000 ether + borrowing.MUSD_GAS_COMPENSATION(), "opening debt excludes reserve");
        uint256 capacity = ForkManager(MANAGER).getTroveMaxBorrowingCapacity(actor);
        vm.prank(actor); borrowing.addColl{value: 0.1 ether}(address(0), address(0));
        require(token.balanceOf(actor) == beforeBalance + 2000 ether, "top up minted MUSD");
        require(debt(actor) == openedDebt, "top up changed debt");
        require(ForkManager(MANAGER).getTroveMaxBorrowingCapacity(actor) == capacity, "top up reset capacity");
        vm.prank(actor); borrowing.withdrawMUSD(100 ether, address(0), address(0));
        require(token.balanceOf(actor) == beforeBalance + 2100 ether, "additional borrowing proceeds mismatch");
        uint256 borrowedDebt = debt(actor);
        require(borrowedDebt > openedDebt, "borrowing did not increase debt");
        require(token.allowance(actor, OPERATIONS) == 0, "unexpected repayment approval");
        vm.prank(actor); borrowing.repayMUSD(50 ether, address(0), address(0));
        require(debt(actor) == borrowedDebt - 50 ether, "repayment debt mismatch");
        require(token.balanceOf(actor) == beforeBalance + 2050 ether, "repayment balance mismatch");
        uint256 obligationBefore = payments.outstandingObligations();
        uint256 escrowBefore = token.balanceOf(PAYMENTS);
        vm.prank(actor); require(token.approve(PAYMENTS, 100 ether), "funding approval rejected");
        vm.prank(actor); uint256 id = payments.createSchedule(recipient, 100 ether, uint64(block.timestamp + 120), uint64(block.timestamp + 3600), bytes32(0));
        ForkPayments.Schedule memory schedule = payments.getSchedule(id);
        require(schedule.sender == actor && schedule.recipient == recipient && schedule.total == 100 ether, "payment terms mismatch");
        require(ForkManager(MANAGER).getTroveStatus(actor) == 1, "founder lost position ownership");
        require(payments.outstandingObligations() == obligationBefore + 100 ether && token.balanceOf(PAYMENTS) == escrowBefore + 100 ether, "escrow accounting mismatch");
        uint256 recipientBefore = token.balanceOf(recipient);
        vm.warp(schedule.end);
        vm.prank(recipient); payments.claim(id);
        require(token.balanceOf(recipient) == recipientBefore + 100 ether, "recipient claim mismatch");
        require(payments.outstandingObligations() == obligationBefore, "claim did not discharge obligation");
    }
}
