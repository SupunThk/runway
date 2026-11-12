// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;
import {RunwayMilestones} from "../src/RunwayMilestones.sol";
import {AdversarialMUSD, NoReturnMUSD} from "./RunwaySecurity.t.sol";
import {Vm} from "./RunwayPayments.t.sol";
contract RunwayMilestonesSecurityTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    AdversarialMUSD token; RunwayMilestones escrow; address constant recipient = address(0xBEEF);
    function setUp() public { vm.warp(1000); token = new AdversarialMUSD(); escrow = new RunwayMilestones(address(token)); token.mint(address(this), 1000); token.approve(address(escrow), type(uint256).max); }
    function create() internal returns (uint256) { uint256[] memory a = new uint256[](2); a[0] = 40; a[1] = 60; return escrow.createEscrow(recipient, a, 0, bytes32(0)); }
    function testFeeAndFalseFundingRollBack() public {
        token.configure(1, address(0), ""); vm.expectRevert(RunwayMilestones.UnsupportedToken.selector); create();
        require(escrow.escrowCount() == 0 && token.balanceOf(address(this)) == 1000);
        token.configure(2, address(0), ""); vm.expectRevert(); create(); require(escrow.outstandingObligations() == 0);
    }
    function testReentrantFundingCannotMutateApprovalClaimOrCancel() public {
        token.configure(0, address(escrow), abi.encodeCall(escrow.cancel, (1))); create();
        require(token.attempted() && !token.callbackSucceeded());
        escrow.approveMilestone(1, 0);
        token.configure(0, address(escrow), abi.encodeCall(escrow.claim, (1))); escrow.claim(1);
        require(token.attempted() && !token.callbackSucceeded() && token.balanceOf(recipient) == 40);
        token.configure(0, address(escrow), abi.encodeCall(escrow.approveMilestone, (1, 1))); escrow.cancel(1);
        require(!token.callbackSucceeded() && escrow.outstandingObligations() == 0 && token.balanceOf(address(escrow)) == 0);
    }
    function testRefusedClaimAndRefundLeaveAccountingIntact() public {
        create(); escrow.approveMilestone(1, 0); token.configure(3, address(0), "");
        vm.expectRevert(); escrow.claim(1); require(escrow.getEscrow(1).claimed == 0 && escrow.outstandingObligations() == 100);
        vm.expectRevert(); escrow.cancel(1); require(!escrow.getEscrow(1).cancelled && escrow.outstandingObligations() == 100);
    }
    function testNoReturnTokenAndDonationsNeverIncreaseEntitlement() public {
        NoReturnMUSD legacy = new NoReturnMUSD(); RunwayMilestones p = new RunwayMilestones(address(legacy));
        legacy.mint(address(this), 200); legacy.approve(address(p), 100);
        uint256[] memory a = new uint256[](1); a[0] = 100;
        p.createEscrow(recipient, a, 0, bytes32(0)); legacy.transfer(address(p), 100);
        p.approveMilestone(1, 0); vm.prank(address(0xCAFE)); p.claim(1);
        require(legacy.balanceOf(recipient) == 100 && legacy.balanceOf(address(p)) == 100 && p.outstandingObligations() == 0);
    }
}
