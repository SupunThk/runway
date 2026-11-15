// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {RunwayPayments} from "../src/RunwayPayments.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

interface FeeVm {
    function warp(uint256) external;
    function prank(address) external;
    function expectRevert() external;
    function expectRevert(bytes4) external;
    function expectRevert(bytes calldata) external;
}

contract FeeMockMUSD is ERC20 {
    constructor() ERC20("Mock MUSD", "MUSD") {}
    function mint(address to, uint256 amount) external { _mint(to, amount); }
}

contract RunwayPaymentsFeesTest {
    FeeVm constant vm = FeeVm(address(uint160(uint256(keccak256("hevm cheat code")))));
    FeeMockMUSD token;
    RunwayPayments payments;
    address treasury = address(0xFEE);
    address recipient = address(0xBEEF);

    function setUp() public {
        vm.warp(1000);
        token = new FeeMockMUSD();
        payments = new RunwayPayments(address(token), treasury, 25, 25 ether);
        token.mint(address(this), 1_000_000 ether);
        token.approve(address(payments), type(uint256).max);
    }

    function testFeeIsChargedOnTopAndNeverEntersEscrow() public {
        uint256 senderBefore = token.balanceOf(address(this));
        uint256 id = payments.createScheduleWithMaxFee(recipient, 1000 ether, 1100, 1200, bytes32(0), 2.5 ether);
        require(token.balanceOf(treasury) == 2.5 ether, "fee");
        require(token.balanceOf(address(payments)) == 1000 ether, "escrow");
        require(payments.outstandingObligations() == 1000 ether, "obligations");
        require(senderBefore - token.balanceOf(address(this)) == 1002.5 ether, "debit");
        require(payments.totalFeesCollected() == 2.5 ether, "total");
        vm.warp(1200);
        payments.claim(id);
        require(token.balanceOf(recipient) == 1000 ether, "recipient gets 100%");
    }

    function testFeeIsCapped() public view {
        require(payments.scheduleFee(1_000_000 ether) == 25 ether);
        require(payments.scheduleFee(400 ether) == 1 ether);
        require(payments.scheduleFee(1) == 0);
    }

    function testMaxFeeProtectsAgainstFeeIncrease() public {
        payments.setFeeConfig(treasury, 100, 100 ether);
        vm.expectRevert(RunwayPayments.FeeAboveMaximum.selector);
        payments.createScheduleWithMaxFee(recipient, 1000 ether, 1100, 1200, bytes32(0), 2.5 ether);
        require(payments.scheduleCount() == 0 && token.balanceOf(treasury) == 0);
    }

    function testLegacyEntryPointChargesCurrentFee() public {
        payments.createSchedule(recipient, 1000 ether, 1100, 1200, bytes32(0));
        require(token.balanceOf(treasury) == 2.5 ether);
    }

    function testAllowanceMustCoverFee() public {
        token.approve(address(payments), 1000 ether);
        vm.expectRevert();
        payments.createSchedule(recipient, 1000 ether, 1100, 1200, bytes32(0));
        require(payments.scheduleCount() == 0 && token.balanceOf(address(payments)) == 0);
    }

    function testCancellationRefundsPrincipalButNotFee() public {
        uint256 id = payments.createSchedule(recipient, 1000 ether, 1100, 1200, bytes32(0));
        uint256 before = token.balanceOf(address(this));
        payments.cancel(id);
        require(token.balanceOf(address(this)) - before == 1000 ether);
        require(token.balanceOf(treasury) == 2.5 ether);
        require(payments.outstandingObligations() == 0);
    }

    function testZeroFeeConfigCollectsNothing() public {
        payments.setFeeConfig(address(0), 0, 0);
        payments.createSchedule(recipient, 1000 ether, 1100, 1200, bytes32(0));
        require(payments.totalFeesCollected() == 0 && token.balanceOf(address(payments)) == 1000 ether);
    }

    function testFeeConfigBounds() public {
        vm.expectRevert(RunwayPayments.FeeAboveMaximum.selector);
        payments.setFeeConfig(treasury, 101, 25 ether);
        vm.expectRevert(RunwayPayments.FeeAboveMaximum.selector);
        payments.setFeeConfig(treasury, 25, 100 ether + 1);
        vm.expectRevert(RunwayPayments.InvalidInput.selector);
        payments.setFeeConfig(address(0), 25, 25 ether);
        vm.expectRevert(RunwayPayments.InvalidInput.selector);
        payments.setFeeConfig(address(payments), 25, 25 ether);
        vm.expectRevert(RunwayPayments.InvalidInput.selector);
        payments.setFeeConfig(treasury, 25, 0);
    }

    function testOnlyOwnerSetsFees() public {
        vm.prank(address(0xBAD));
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, address(0xBAD)));
        payments.setFeeConfig(treasury, 0, 0);
    }

    function testConstructorRejectsFeeAboveCeiling() public {
        vm.expectRevert(RunwayPayments.FeeAboveMaximum.selector);
        new RunwayPayments(address(token), treasury, 500, 25 ether);
    }

    function testFuzzFeeBounded(uint256 amount) public view {
        amount = amount % 1e30;
        uint256 fee = payments.scheduleFee(amount);
        require(fee <= 25 ether && fee <= amount * 25 / 10_000);
    }
}
