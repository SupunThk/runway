// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {RunwayPayments} from "../src/RunwayPayments.sol";
import {MockMUSD, Vm} from "./RunwayPayments.t.sol";

contract AdversarialMUSD is MockMUSD {
    uint8 public mode;
    address public target;
    bytes public callback;
    bool public attempted;
    bool public callbackSucceeded;
    bytes4 public callbackError;

    function configure(uint8 nextMode, address nextTarget, bytes memory nextCallback) external {
        mode = nextMode;
        target = nextTarget;
        callback = nextCallback;
        attempted = false;
        callbackSucceeded = false;
        callbackError = bytes4(0);
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        if (mode == 1) return super.transferFrom(from, to, amount - 1);
        if (mode == 2) return false;
        bool result = super.transferFrom(from, to, amount);
        attack();
        return result;
    }

    function transfer(address to, uint256 amount) public override returns (bool) {
        if (mode == 3) return false;
        if (mode == 4) revert("Token transfer refused");
        bool result = super.transfer(to, amount);
        attack();
        return result;
    }

    function attack() private {
        if (target == address(0)) return;
        attempted = true;
        bytes memory result;
        (callbackSucceeded, result) = target.call(callback);
        if (result.length >= 4) callbackError = bytes4(result);
    }
}

// Legacy ERC-20 calls may succeed with no return data. SafeERC20 supports this.
contract NoReturnMUSD {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external {
        allowance[msg.sender][spender] = amount;
    }

    function transfer(address to, uint256 amount) external {
        move(msg.sender, to, amount);
    }

    function transferFrom(address from, address to, uint256 amount) external {
        allowance[from][msg.sender] -= amount;
        move(from, to, amount);
    }

    function move(address from, address to, uint256 amount) private {
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
    }
}

contract RunwaySecurityTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    AdversarialMUSD token;
    RunwayPayments payments;
    address constant recipient = address(0xBEEF);
    address constant stranger = address(0xCAFE);

    function setUp() public {
        vm.warp(1000);
        token = new AdversarialMUSD();
        payments = new RunwayPayments(address(token));
        token.mint(address(this), 1000 ether);
        token.approve(address(payments), type(uint256).max);
    }

    function create(uint256 amount) internal returns (uint256) {
        return payments.createSchedule(recipient, amount, 1100, 1200, bytes32(0));
    }

    function testFeeOnFundingRevertsAllStateAndBalances() public {
        token.configure(1, address(0), "");
        vm.expectRevert(RunwayPayments.UnsupportedToken.selector);
        create(100);
        require(payments.scheduleCount() == 0 && payments.outstandingObligations() == 0);
        require(token.balanceOf(address(this)) == 1000 ether && token.balanceOf(address(payments)) == 0);
        require(payments.getSenderScheduleIds(address(this), 0, 100).length == 0);
        require(payments.getRecipientScheduleIds(recipient, 0, 100).length == 0);
        token.configure(0, address(0), "");
        require(create(100) == 1, "Failed funding consumed an ID");
    }

    function testFalseFundingReturnRevertsWithoutCreatingSchedule() public {
        token.configure(2, address(0), "");
        vm.expectRevert();
        create(100);
        require(payments.scheduleCount() == 0 && payments.outstandingObligations() == 0);
        require(token.balanceOf(address(this)) == 1000 ether && token.balanceOf(address(payments)) == 0);
    }

    function testOutgoingTransferFailuresAreAtomicAndRetryable() public {
        for (uint8 mode = 3; mode <= 4; ++mode) {
            vm.warp(1000);
            uint256 id = create(101);
            vm.warp(1150);
            uint256 balance = token.balanceOf(address(payments));
            uint256 obligations = payments.outstandingObligations();
            uint256 recipientBalance = token.balanceOf(recipient);
            uint256 senderBalance = token.balanceOf(address(this));
            token.configure(mode, address(0), "");
            vm.expectRevert();
            payments.claim(id);
            require(payments.getSchedule(id).claimed == 0 && payments.claimable(id) == 50);
            vm.expectRevert();
            payments.cancel(id);
            RunwayPayments.Schedule memory failed = payments.getSchedule(id);
            require(!failed.cancelled && failed.vestedAtCancellation == 0 && failed.claimed == 0);
            require(payments.outstandingObligations() == obligations && token.balanceOf(address(payments)) == balance);
            require(token.balanceOf(recipient) == recipientBalance && token.balanceOf(address(this)) == senderBalance);
            token.configure(0, address(0), "");
            payments.cancel(id);
            payments.claim(id);
            require(token.balanceOf(recipient) == recipientBalance + 50);
            require(token.balanceOf(address(this)) == senderBalance + 51);
            require(payments.outstandingObligations() == obligations - 101);
        }
    }

    function testAllWriteEntryPointsRejectTokenReentrancy() public {
        // Every outer write is tested against callbacks to every write entry.
        for (uint8 outer; outer < 3; ++outer) {
            for (uint8 inner; inner < 3; ++inner) {
                vm.warp(1000);
                token.configure(0, address(0), "");
                uint256 id = create(100);
                if (outer != 0) vm.warp(1150);
                bytes memory payload = inner == 0
                    ? abi.encodeCall(payments.createSchedule, (recipient, 1, uint64(1150), uint64(1200), bytes32(0)))
                    : inner == 1 ? abi.encodeCall(payments.claim, (id)) : abi.encodeCall(payments.cancel, (id));
                token.configure(0, address(payments), payload);
                if (outer == 0) create(100);
                else if (outer == 1) payments.claim(id);
                else payments.cancel(id);
                require(token.attempted() && !token.callbackSucceeded(), "Reentrant write was not blocked");
                require(
                    token.callbackError() == bytes4(keccak256("ReentrancyGuardReentrantCall()")),
                    "Unexpected callback failure"
                );
                require(token.balanceOf(address(payments)) == payments.outstandingObligations());
            }
        }
    }

    function testPermissionlessClaimPaysOnlyImmutableRecipient() public {
        uint256 id = create(101);
        vm.warp(1150);
        vm.prank(stranger);
        payments.claim(id);
        require(token.balanceOf(stranger) == 0 && token.balanceOf(recipient) == 50);
        vm.prank(stranger);
        vm.expectRevert(RunwayPayments.Unauthorized.selector);
        payments.cancel(id);
        payments.cancel(id);
        require(payments.getSchedule(id).recipient == recipient);
        require(payments.outstandingObligations() == 0);
    }

    function testCancelAndClaimOrderingHaveIdenticalFinalAllocation() public {
        uint256 first = create(101);
        uint256 second = create(101);
        vm.warp(1150);
        payments.claim(first);
        payments.cancel(first);
        payments.cancel(second);
        payments.claim(second);
        require(payments.getSchedule(first).claimed == 50 && payments.getSchedule(second).claimed == 50);
        require(token.balanceOf(recipient) == 100 && payments.outstandingObligations() == 0);
        vm.warp(1200);
        vm.expectRevert(RunwayPayments.NothingToClaim.selector);
        payments.claim(second);
        require(token.balanceOf(address(payments)) == 0);
    }

    function testDonationsCannotBeClaimedOrRefundedAsEntitlements() public {
        uint256 id = create(101);
        token.transfer(address(payments), 777);
        vm.warp(1150);
        payments.cancel(id);
        payments.claim(id);
        require(payments.outstandingObligations() == 0 && token.balanceOf(address(payments)) == 777);
        vm.expectRevert(RunwayPayments.NothingToClaim.selector);
        payments.claim(id);
        require(token.balanceOf(recipient) == 50);
    }

    function testNoReturnTokenCompletesCancellationAndClaim() public {
        NoReturnMUSD legacy = new NoReturnMUSD();
        RunwayPayments p = new RunwayPayments(address(legacy));
        legacy.mint(address(this), 101);
        legacy.approve(address(p), 101);
        uint256 id = p.createSchedule(recipient, 101, 1100, 1200, bytes32(0));
        vm.warp(1150);
        p.cancel(id);
        p.claim(id);
        require(legacy.balanceOf(recipient) == 50 && legacy.balanceOf(address(this)) == 51);
        require(p.outstandingObligations() == 0 && legacy.balanceOf(address(p)) == 0);
    }

    function testFullPrecisionVestingWhenIntermediateProductOverflows() public {
        MockMUSD large = new MockMUSD();
        RunwayPayments p = new RunwayPayments(address(large));
        uint256 total = type(uint256).max - 1;
        large.mint(address(this), total);
        large.approve(address(p), total);
        uint256 id = p.createSchedule(recipient, total, 1100, 1200, bytes32(0));
        vm.warp(1150);
        p.claim(id);
        require(large.balanceOf(recipient) == total / 2);
        p.cancel(id);
        require(p.outstandingObligations() == 0 && large.balanceOf(address(p)) == 0);
        require(large.balanceOf(address(this)) + large.balanceOf(recipient) == total);
    }

    function testInvalidConstructorAndContractRecipient() public {
        vm.expectRevert(RunwayPayments.InvalidInput.selector);
        new RunwayPayments(address(0));
        vm.expectRevert(RunwayPayments.InvalidInput.selector);
        new RunwayPayments(stranger);
        vm.expectRevert(RunwayPayments.InvalidInput.selector);
        payments.createSchedule(address(payments), 100, 1100, 1200, bytes32(0));
    }

    function testUnknownIdsAndPaginationLimitsDoNotChangeState() public {
        vm.expectRevert(RunwayPayments.UnknownSchedule.selector);
        payments.cancel(0);
        vm.expectRevert(RunwayPayments.UnknownSchedule.selector);
        payments.claimable(type(uint256).max);
        vm.expectRevert(RunwayPayments.UnknownSchedule.selector);
        payments.getSchedule(1);
        vm.expectRevert(RunwayPayments.InvalidInput.selector);
        payments.getSenderScheduleIds(address(this), 0, 101);
        vm.expectRevert(RunwayPayments.InvalidInput.selector);
        payments.getRecipientScheduleIds(recipient, 0, type(uint256).max);
        require(payments.scheduleCount() == 0 && payments.outstandingObligations() == 0);
    }

    function testDiscoveryAcrossContractPageBoundary() public {
        for (uint256 i; i < 105; ++i) {
            create(1);
        }
        uint256[] memory sent = payments.getSenderScheduleIds(address(this), 100, 100);
        uint256[] memory received = payments.getRecipientScheduleIds(recipient, 100, 100);
        require(sent.length == 5 && received.length == 5);
        for (uint256 i; i < 5; ++i) {
            require(sent[i] == 101 + i && received[i] == sent[i]);
        }
        require(payments.getSenderScheduleIds(address(this), 105, 100).length == 0);
        require(payments.getRecipientScheduleIds(recipient, 0, 0).length == 0);
    }
}
