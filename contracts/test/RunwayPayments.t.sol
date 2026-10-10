// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {RunwayPayments} from "../src/RunwayPayments.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

interface Vm {
    function warp(uint256) external;
    function prank(address) external;
    function expectRevert() external;
    function expectRevert(bytes4) external;
}

contract MockMUSD is ERC20 {
    constructor() ERC20("Mock MUSD", "MUSD") {}
    function mint(address to, uint256 amount) external { _mint(to, amount); }
}

contract RunwayPaymentsTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    MockMUSD token;
    RunwayPayments payments;
    address recipient = address(0xBEEF);

    function setUp() public {
        vm.warp(1000);
        token = new MockMUSD();
        payments = new RunwayPayments(address(token));
        token.mint(address(this), 1_000_000 ether);
        token.approve(address(payments), type(uint256).max);
    }

    function create(uint256 amount) internal returns (uint256) {
        return payments.createSchedule(recipient, amount, 1100, 1200, bytes32(0));
    }

    function testAtomicFundingAndDiscovery() public {
        uint256 id = create(100 ether);
        require(token.balanceOf(address(payments)) == 100 ether);
        require(payments.getSenderScheduleIds(address(this), 0, 10)[0] == id);
        require(payments.getRecipientScheduleIds(recipient, 0, 10)[0] == id);
        require(payments.getSenderScheduleIds(address(this), type(uint256).max, 10).length == 0);
    }

    function testInsufficientAllowanceIsAtomic() public {
        token.approve(address(payments), 0);
        vm.expectRevert();
        create(100 ether);
        require(payments.scheduleCount() == 0 && token.balanceOf(address(payments)) == 0);
    }

    function testInsufficientBalanceIsAtomic() public {
        vm.expectRevert();
        create(2_000_000 ether);
        require(payments.scheduleCount() == 0);
    }

    function testInvalidInputs() public {
        vm.expectRevert(RunwayPayments.InvalidInput.selector);
        payments.createSchedule(address(0), 100, 1100, 1200, bytes32(0));
        vm.expectRevert(RunwayPayments.InvalidInput.selector);
        create(0);
        vm.expectRevert(RunwayPayments.InvalidInput.selector);
        payments.createSchedule(recipient, 100, 999, 1200, bytes32(0));
        vm.expectRevert(RunwayPayments.InvalidInput.selector);
        payments.createSchedule(recipient, 100, 1100, 1100, bytes32(0));
    }

    function testPartialClaimsAndFinalRounding() public {
        uint256 id = create(101);
        vm.expectRevert(RunwayPayments.NothingToClaim.selector);
        payments.claim(id);
        vm.warp(1100);
        require(payments.claimable(id) == 0);
        vm.warp(1150);
        vm.prank(address(0xCAFE));
        payments.claim(id);
        require(token.balanceOf(recipient) == 50);
        vm.expectRevert(RunwayPayments.NothingToClaim.selector);
        payments.claim(id);
        vm.warp(1200);
        payments.claim(id);
        require(token.balanceOf(recipient) == 101);
        require(payments.outstandingObligations() == 0);
        vm.warp(1300);
        vm.expectRevert(RunwayPayments.NothingToClaim.selector);
        payments.claim(id);
    }

    function testCancellationPreservesVestedEntitlement() public {
        uint256 id = create(100 ether);
        vm.warp(1120);
        payments.claim(id);
        vm.warp(1150);
        payments.cancel(id);
        require(payments.claimable(id) == 30 ether);
        require(payments.outstandingObligations() == 30 ether);
        vm.warp(1300);
        payments.claim(id);
        require(token.balanceOf(recipient) == 50 ether);
        require(token.balanceOf(address(payments)) == 0);
        vm.expectRevert(RunwayPayments.AlreadyCancelled.selector);
        payments.cancel(id);
    }

    function testCancellationBeforeStartRefundsAll() public {
        uint256 beforeBalance = token.balanceOf(address(this));
        uint256 id = create(100);
        payments.cancel(id);
        require(token.balanceOf(address(this)) == beforeBalance);
        require(payments.claimable(id) == 0);
    }

    function testAuthorizationAndEndCancellation() public {
        uint256 id = create(100);
        vm.prank(recipient);
        vm.expectRevert(RunwayPayments.Unauthorized.selector);
        payments.cancel(id);
        vm.warp(1200);
        vm.expectRevert(RunwayPayments.AccrualEnded.selector);
        payments.cancel(id);
        vm.expectRevert(RunwayPayments.UnknownSchedule.selector);
        payments.claim(999);
    }

    function testFuzzAccountingAcrossSchedules(uint96 rawAmount, uint8 rawElapsed, bool claimFirst) public {
        uint256 amount = uint256(rawAmount) % 100_000 ether + 1;
        uint256 id = create(amount);
        create(777);
        uint256 elapsed = uint256(rawElapsed) % 100;
        vm.warp(1100 + elapsed);
        uint256 entitled = amount * elapsed / 100;
        if (claimFirst && entitled > 0) payments.claim(id);
        uint256 beforeRefund = token.balanceOf(address(this));
        payments.cancel(id);
        uint256 refunded = token.balanceOf(address(this)) - beforeRefund;
        RunwayPayments.Schedule memory s = payments.getSchedule(id);
        uint256 remaining = payments.claimable(id);
        require(s.claimed + refunded + remaining == amount);
        require(token.balanceOf(address(payments)) == payments.outstandingObligations());
        if (remaining > 0) payments.claim(id);
        require(token.balanceOf(address(payments)) == 777);
        require(payments.getSchedule(id).recipient == recipient);
    }
}
