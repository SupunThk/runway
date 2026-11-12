// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;
import {RunwayMilestones} from "../src/RunwayMilestones.sol";
import {MockMUSD, Vm} from "./RunwayPayments.t.sol";

contract RunwayMilestonesTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    MockMUSD token;
    RunwayMilestones escrow;
    address constant recipient = address(0xBEEF);
    function setUp() public {
        vm.warp(1000); token = new MockMUSD(); escrow = new RunwayMilestones(address(token));
        token.mint(address(this), 1_000_000 ether); token.approve(address(escrow), type(uint256).max);
    }
    function amounts() internal pure returns (uint256[] memory a) { a = new uint256[](3); a[0] = 10; a[1] = 20; a[2] = 30; }
    function testApproveClaimCancelPreservesApprovedFunds() public {
        uint256 id = escrow.createEscrow(recipient, amounts(), 0, bytes32(uint256(7)));
        escrow.approveMilestone(id, 1); escrow.cancel(id);
        require(escrow.outstandingObligations() == 20 && token.balanceOf(address(escrow)) == 20);
        vm.prank(address(0xCAFE)); escrow.claim(id);
        require(token.balanceOf(recipient) == 20 && escrow.outstandingObligations() == 0);
        RunwayMilestones.Escrow memory e = escrow.getEscrow(id);
        require(e.refunded == 40 && e.cancelled && e.claimed == 20 && e.referenceHash == bytes32(uint256(7)));
    }
    function testClaimThenCancelAndClaimRemainder() public {
        uint256 id = escrow.createEscrow(recipient, amounts(), 0, bytes32(0));
        escrow.approveMilestone(id, 0); escrow.claim(id); escrow.approveMilestone(id, 2); escrow.cancel(id); escrow.claim(id);
        require(token.balanceOf(recipient) == 40 && token.balanceOf(address(escrow)) == 0);
        require(escrow.getEscrow(id).refunded == 20);
    }
    function testDeadlineAtEqualityAndCancellationBeforeBoundary() public {
        uint256 first = escrow.createEscrow(recipient, amounts(), 1100, bytes32(0));
        uint256 second = escrow.createEscrow(recipient, amounts(), 1100, bytes32(0));
        vm.warp(1099); escrow.approveMilestone(second, 0); escrow.cancel(second);
        vm.warp(1100); require(escrow.claimable(first) == 60 && escrow.claimable(second) == 10);
        vm.expectRevert(RunwayMilestones.AutoReleased.selector); escrow.cancel(first);
        vm.expectRevert(RunwayMilestones.AutoReleased.selector); escrow.approveMilestone(first, 0);
        escrow.claim(first); escrow.claim(second); require(token.balanceOf(recipient) == 70);
    }
    function testApprovalAndCancellationReverts() public {
        uint256 id = escrow.createEscrow(recipient, amounts(), 0, bytes32(0));
        vm.expectRevert(RunwayMilestones.NothingToClaim.selector); escrow.claim(id);
        vm.prank(recipient); vm.expectRevert(RunwayMilestones.Unauthorized.selector); escrow.approveMilestone(id, 0);
        vm.prank(recipient); vm.expectRevert(RunwayMilestones.Unauthorized.selector); escrow.cancel(id);
        vm.expectRevert(RunwayMilestones.InvalidInput.selector); escrow.approveMilestone(id, 3);
        escrow.approveMilestone(id, 0);
        vm.expectRevert(RunwayMilestones.AlreadyApproved.selector); escrow.approveMilestone(id, 0);
        escrow.cancel(id);
        vm.expectRevert(RunwayMilestones.AlreadyCancelled.selector); escrow.approveMilestone(id, 1);
        vm.expectRevert(RunwayMilestones.AlreadyCancelled.selector); escrow.cancel(id);
        vm.expectRevert(RunwayMilestones.UnknownEscrow.selector); escrow.getEscrow(0);
        vm.expectRevert(RunwayMilestones.UnknownEscrow.selector); escrow.claim(999);
        vm.expectRevert(RunwayMilestones.UnknownEscrow.selector); escrow.cancel(999);
        vm.expectRevert(RunwayMilestones.UnknownEscrow.selector); escrow.getMilestones(999);
        vm.expectRevert(RunwayMilestones.UnknownEscrow.selector); escrow.claimable(999);
    }
    function testAllApprovedCannotRefundAndRepeatedClaimReverts() public {
        uint256 id = escrow.createEscrow(recipient, amounts(), 0, bytes32(0));
        escrow.approveMilestone(id, 0); escrow.approveMilestone(id, 1); escrow.approveMilestone(id, 2);
        vm.expectRevert(RunwayMilestones.NothingToRefund.selector); escrow.cancel(id);
        escrow.claim(id); vm.expectRevert(RunwayMilestones.NothingToClaim.selector); escrow.claim(id);
    }
    function testInvalidCreationAndConstructor() public {
        vm.expectRevert(RunwayMilestones.InvalidInput.selector); new RunwayMilestones(address(0));
        vm.expectRevert(RunwayMilestones.InvalidInput.selector); new RunwayMilestones(recipient);
        vm.expectRevert(RunwayMilestones.InvalidInput.selector); escrow.createEscrow(address(0), amounts(), 0, bytes32(0));
        vm.expectRevert(RunwayMilestones.InvalidInput.selector); escrow.createEscrow(address(escrow), amounts(), 0, bytes32(0));
        vm.expectRevert(RunwayMilestones.InvalidInput.selector); escrow.createEscrow(address(this), amounts(), 0, bytes32(0));
        vm.expectRevert(RunwayMilestones.InvalidInput.selector); escrow.createEscrow(recipient, amounts(), 1000, bytes32(0));
        uint256[] memory empty = new uint256[](0);
        vm.expectRevert(RunwayMilestones.InvalidInput.selector); escrow.createEscrow(recipient, empty, 0, bytes32(0));
        uint256[] memory zero = amounts(); zero[1] = 0;
        vm.expectRevert(RunwayMilestones.InvalidInput.selector); escrow.createEscrow(recipient, zero, 0, bytes32(0));
        uint256[] memory large = new uint256[](21);
        vm.expectRevert(RunwayMilestones.InvalidInput.selector); escrow.createEscrow(recipient, large, 0, bytes32(0));
    }
    function testFundingFailureRollsBackDiscoveryAndAccounting() public {
        token.approve(address(escrow), 0); vm.expectRevert(); escrow.createEscrow(recipient, amounts(), 0, bytes32(0));
        require(escrow.escrowCount() == 0 && escrow.outstandingObligations() == 0 && token.balanceOf(address(escrow)) == 0);
    }
    function testPaginationAndMilestoneDiscovery() public {
        uint256 id = escrow.createEscrow(recipient, amounts(), 0, bytes32(0)); escrow.approveMilestone(id, 2);
        (uint256[] memory a, bool[] memory approved) = escrow.getMilestones(id);
        require(a.length == 3 && a[2] == 30 && approved[2] && !approved[0]);
        require(escrow.getSenderEscrowIds(address(this), 0, 1)[0] == id && escrow.getRecipientEscrowIds(recipient, 0, 100)[0] == id);
        require(escrow.getSenderEscrowIds(address(this), type(uint256).max, 100).length == 0);
        vm.expectRevert(RunwayMilestones.InvalidInput.selector); escrow.getSenderEscrowIds(address(this), 0, 0);
        vm.expectRevert(RunwayMilestones.InvalidInput.selector); escrow.getRecipientEscrowIds(recipient, 0, 101);
    }
    function testFuzzArbitraryCountAmountsAndApprovalOrder(uint96 seed, uint8 countSeed, bool reverse) public {
        uint256 count = uint256(countSeed) % 20 + 1; uint256 value = uint256(seed) % 10 ** 18 + 1;
        uint256[] memory a = new uint256[](count); for (uint256 i; i < count; ++i) a[i] = value + i;
        uint256 total = count * value + count * (count - 1) / 2;
        uint256 id = escrow.createEscrow(recipient, a, 0, bytes32(0));
        for (uint256 i; i < count; ++i) { escrow.approveMilestone(id, uint8(reverse ? count - 1 - i : i)); escrow.claim(id); }
        require(token.balanceOf(recipient) == total && escrow.outstandingObligations() == 0 && token.balanceOf(address(escrow)) == 0);
    }
}
