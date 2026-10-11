// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {RunwayPayments} from "../src/RunwayPayments.sol";
import {MockMUSD, Vm} from "./RunwayPayments.t.sol";

/// @dev Independent reference model; never derives expected accounting from contract getters.
contract RunwayHandler {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    struct Model {
        address sender;
        address recipient;
        uint256 total;
        uint64 start;
        uint64 end;
        bytes32 referenceHash;
        uint256 paid;
        uint256 refunded;
        bool cancelled;
        uint256 frozenEntitlement;
    }
    RunwayPayments public immutable payments;
    MockMUSD public immutable token;
    uint256 public constant initialBalance = 10 ** 30;
    address[3] public actors = [address(0xA11CE), address(0xB0B), address(0xC0FFEE)];
    Model[] private models;
    uint256 public donations;
    mapping(address => uint256) public deposits;
    mapping(address => uint256) public refunds;
    mapping(address => uint256) public payouts;
    mapping(address => uint256) public donated;
    uint256 public successfulClaims;
    uint256 public successfulCancellations;

    constructor(RunwayPayments p, MockMUSD t) {
        payments = p;
        token = t;
        for (uint256 i; i < actors.length; ++i) {
            t.mint(actors[i], initialBalance);
            vm.prank(actors[i]);
            t.approve(address(p), type(uint256).max);
        }
    }

    function count() external view returns (uint256) {
        return models.length;
    }

    function model(uint256 index) external view returns (Model memory) {
        return models[index];
    }

    function entitlement(Model memory m) public view returns (uint256) {
        if (m.cancelled) return m.frozenEntitlement;
        if (block.timestamp <= m.start) return 0;
        if (block.timestamp >= m.end) return m.total;
        // Bounded total <= 1e24 and duration <= 30 days keep this simple model's multiplication safe.
        return m.total * (block.timestamp - m.start) / (m.end - m.start);
    }

    function create(
        uint256 senderSeed,
        uint256 recipientSeed,
        uint256 amountSeed,
        uint256 delaySeed,
        uint256 durationSeed
    ) external {
        if (models.length >= 32) return;
        address sender = actors[senderSeed % 3];
        address recipient = actors[recipientSeed % 3];
        uint256 total = amountSeed % 10 ** 24 + 1;
        uint64 start = uint64(block.timestamp + delaySeed % 3601);
        uint64 end = start + uint64(durationSeed % 30 days + 1);
        bytes32 refHash = keccak256(abi.encode(senderSeed, recipientSeed, amountSeed, models.length));
        vm.prank(sender);
        uint256 id = payments.createSchedule(recipient, total, start, end, refHash);
        require(id == models.length + 1, "Noncontiguous schedule ID");
        models.push(Model(sender, recipient, total, start, end, refHash, 0, 0, false, 0));
        deposits[sender] += total;
    }

    function advance(uint256 secondsSeed) external {
        vm.warp(block.timestamp + secondsSeed % 7 days);
    }

    function claim(uint256 idSeed, uint256 callerSeed) external {
        if (models.length == 0) return;
        uint256 index = idSeed % models.length;
        Model storage m = models[index];
        uint256 due = entitlement(m) - m.paid;
        vm.prank(actors[callerSeed % 3]);
        (bool ok, bytes memory result) = address(payments).call(abi.encodeCall(payments.claim, (index + 1)));
        if (due == 0) {
            require(!ok && bytes4(result) == RunwayPayments.NothingToClaim.selector, "Empty claim succeeded");
        } else {
            require(ok, "Valid claim failed");
            m.paid += due;
            payouts[m.recipient] += due;
            ++successfulClaims;
        }
    }

    function cancel(uint256 idSeed) external {
        if (models.length == 0) return;
        uint256 index = idSeed % models.length;
        Model storage m = models[index];
        uint256 earned = entitlement(m);
        vm.prank(m.sender);
        (bool ok, bytes memory result) = address(payments).call(abi.encodeCall(payments.cancel, (index + 1)));
        if (m.cancelled) {
            require(
                !ok && bytes4(result) == RunwayPayments.AlreadyCancelled.selector, "Repeated cancellation succeeded"
            );
        } else if (block.timestamp >= m.end) {
            require(!ok && bytes4(result) == RunwayPayments.AccrualEnded.selector, "Ended schedule cancelled");
        } else {
            require(ok, "Valid cancellation failed");
            m.cancelled = true;
            m.frozenEntitlement = earned;
            m.refunded = m.total - earned;
            refunds[m.sender] += m.refunded;
            ++successfulCancellations;
        }
    }

    function unauthorizedCancel(uint256 idSeed, uint256 callerSeed) external {
        if (models.length == 0) return;
        uint256 index = idSeed % models.length;
        address caller = actors[callerSeed % 3];
        if (caller == models[index].sender) caller = address(0xBAD);
        vm.prank(caller);
        (bool ok, bytes memory result) = address(payments).call(abi.encodeCall(payments.cancel, (index + 1)));
        require(!ok && bytes4(result) == RunwayPayments.Unauthorized.selector, "Unauthorized cancellation succeeded");
    }

    function donate(uint256 actorSeed, uint256 amountSeed) external {
        address actor = actors[actorSeed % 3];
        uint256 amount = amountSeed % 10 ** 20;
        vm.prank(actor);
        token.transfer(address(payments), amount);
        donations += amount;
        donated[actor] += amount;
    }

    function settleAll() external {
        uint256 end = block.timestamp;
        for (uint256 i; i < models.length; ++i) {
            if (models[i].end > end) end = models[i].end;
        }
        vm.warp(end);
        for (uint256 i; i < models.length; ++i) {
            Model storage m = models[i];
            uint256 due = entitlement(m) - m.paid;
            if (due == 0) continue;
            vm.prank(address(0xBAD));
            payments.claim(i + 1);
            m.paid += due;
            payouts[m.recipient] += due;
            ++successfulClaims;
        }
    }
}

contract RunwayInvariantTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    struct FuzzSelector {
        address addr;
        bytes4[] selectors;
    }
    MockMUSD token;
    RunwayPayments payments;
    RunwayHandler handler;

    function setUp() public {
        vm.warp(1000);
        token = new MockMUSD();
        payments = new RunwayPayments(address(token));
        handler = new RunwayHandler(payments, token);
        // Seed both active and future schedules so invariants cannot pass on an empty system.
        handler.create(0, 1, 100 ether, 0, 30 days - 1);
        handler.create(1, 1, 101, 3600, 100);
        handler.create(2, 0, 777, 0, 60);
    }

    // Foundry's invariant targeting interface, without adding a forge-std dependency.
    function targetContracts() external view returns (address[] memory targets) {
        targets = new address[](1);
        targets[0] = address(handler);
    }

    function targetSelectors() external view returns (FuzzSelector[] memory targets) {
        bytes4[] memory selectors = new bytes4[](6);
        selectors[0] = RunwayHandler.create.selector;
        selectors[1] = RunwayHandler.advance.selector;
        selectors[2] = RunwayHandler.claim.selector;
        selectors[3] = RunwayHandler.cancel.selector;
        selectors[4] = RunwayHandler.unauthorizedCancel.selector;
        selectors[5] = RunwayHandler.donate.selector;
        targets = new FuzzSelector[](1);
        targets[0] = FuzzSelector(address(handler), selectors);
    }

    function invariant_modelAccountingAndSolvency() public view {
        uint256 remaining;
        require(payments.scheduleCount() == handler.count());
        for (uint256 i; i < handler.count(); ++i) {
            RunwayHandler.Model memory m = handler.model(i);
            RunwayPayments.Schedule memory s = payments.getSchedule(i + 1);
            uint256 earned = handler.entitlement(m);
            require(s.sender == m.sender && s.recipient == m.recipient && s.total == m.total);
            require(s.start == m.start && s.end == m.end && s.referenceHash == m.referenceHash);
            require(s.cancelled == m.cancelled && s.vestedAtCancellation == m.frozenEntitlement);
            require(s.claimed == m.paid && s.claimed <= earned && earned <= s.total);
            require(payments.claimable(i + 1) == earned - m.paid);
            uint256 unpaid = m.total - m.paid - m.refunded;
            require(m.paid + m.refunded + unpaid == m.total);
            remaining += unpaid;
        }
        require(payments.outstandingObligations() == remaining, "Obligations disagree with independent model");
        require(token.balanceOf(address(payments)) == remaining + handler.donations(), "Escrow conservation failed");
    }

    function invariant_actorBalancesAndDiscovery() public view {
        uint256 balances = token.balanceOf(address(payments));
        for (uint256 actorIndex; actorIndex < 3; ++actorIndex) {
            address actor = handler.actors(actorIndex);
            uint256 expected = handler.initialBalance() - handler.deposits(actor) - handler.donated(actor)
                + handler.refunds(actor) + handler.payouts(actor);
            require(token.balanceOf(actor) == expected, "Actor received or lost unexpected funds");
            balances += token.balanceOf(actor);
            uint256[] memory sent = payments.getSenderScheduleIds(actor, 0, 100);
            uint256[] memory received = payments.getRecipientScheduleIds(actor, 0, 100);
            uint256 senderIndex;
            uint256 recipientIndex;
            for (uint256 i; i < handler.count(); ++i) {
                RunwayHandler.Model memory m = handler.model(i);
                if (m.sender == actor) {
                    require(sent[senderIndex] == i + 1);
                    ++senderIndex;
                }
                if (m.recipient == actor) {
                    require(received[recipientIndex] == i + 1);
                    ++recipientIndex;
                }
            }
            require(senderIndex == sent.length && recipientIndex == received.length, "Discovery index mismatch");
        }
        require(balances == 3 * handler.initialBalance(), "Global token conservation failed");
        require(token.balanceOf(address(0xBAD)) == 0, "Unauthorized actor received funds");
    }

    function afterInvariant() public {
        handler.settleAll();
        invariant_modelAccountingAndSolvency();
        invariant_actorBalancesAndDiscovery();
        require(payments.outstandingObligations() == 0, "Some entitlement could not be settled");
        require(token.balanceOf(address(payments)) == handler.donations(), "Unexpected funds after final settlement");
    }

    function testHandlerExercisesValidClaimsAndCancellation() public {
        handler.advance(30);
        handler.claim(2, 1);
        handler.cancel(0);
        handler.claim(0, 2);
        handler.unauthorizedCancel(1, 2);
        handler.donate(1, 999);
        handler.advance(4000);
        handler.claim(1, 0);
        require(handler.successfulClaims() == 3 && handler.successfulCancellations() == 1);
        invariant_modelAccountingAndSolvency();
        invariant_actorBalancesAndDiscovery();
        afterInvariant();
    }
}
