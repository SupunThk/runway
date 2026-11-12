// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;
import {RunwayMilestones} from "../src/RunwayMilestones.sol";
import {MockMUSD, Vm} from "./RunwayPayments.t.sol";

/// @dev Independent deposits, approvals, transfers and refunds; never computes expected transfers from contract counters.
contract MilestoneHandler {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    struct Model { address recipient; uint256[3] amounts; uint256 total; uint256 approved; uint256 bitmap; uint256 paid; uint256 refund; uint64 deadline; bool cancelled; }
    RunwayMilestones public immutable escrow; MockMUSD public immutable token;
    uint256 public constant initial = 10 ** 30;
    uint256 public deposited; uint256 public refunded; uint256 public donations;
    mapping(address => uint256) public payouts;
    Model[] private models;
    constructor(RunwayMilestones p, MockMUSD t) { escrow = p; token = t; t.mint(address(this), initial); t.approve(address(p), type(uint256).max); }
    function count() external view returns (uint256) { return models.length; }
    function model(uint256 i) external view returns (Model memory) { return models[i]; }
    function create(uint96 seed, bool timed) external {
        if (models.length >= 24) return;
        uint256[] memory a = new uint256[](3); uint256 total;
        for (uint256 i; i < 3; ++i) { a[i] = uint256(seed) % 10 ** 20 + i + 1; total += a[i]; }
        uint64 deadline = timed ? uint64(block.timestamp + 1000) : 0;
        address recipient = address(uint160(0xBEEF + models.length % 3));
        uint256 id = escrow.createEscrow(recipient, a, deadline, bytes32(uint256(models.length)));
        require(id == models.length + 1); deposited += total;
        models.push(Model(recipient, [a[0], a[1], a[2]], total, 0, 0, 0, 0, deadline, false));
    }
    function approve(uint256 seed, uint8 indexSeed) external {
        if (models.length == 0) return; uint256 i = seed % models.length; Model storage m = models[i]; uint8 index = indexSeed % 3;
        bool expected = !m.cancelled && (m.deadline == 0 || block.timestamp < m.deadline) && m.bitmap & (uint256(1) << index) == 0;
        (bool ok,) = address(escrow).call(abi.encodeCall(escrow.approveMilestone, (i + 1, index))); require(ok == expected, "Approval authorization mismatch");
        if (ok) { m.bitmap |= uint256(1) << index; m.approved += m.amounts[index]; }
    }
    function claim(uint256 seed) external {
        if (models.length == 0) return; uint256 i = seed % models.length; Model storage m = models[i];
        uint256 entitlement = !m.cancelled && m.deadline != 0 && block.timestamp >= m.deadline ? m.total : m.approved;
        uint256 due = entitlement - m.paid;
        vm.prank(address(0xCAFE)); (bool ok,) = address(escrow).call(abi.encodeCall(escrow.claim, (i + 1))); require(ok == (due > 0), "Claim result mismatch");
        if (ok) { m.paid += due; payouts[m.recipient] += due; }
    }
    function cancel(uint256 seed) external {
        if (models.length == 0) return; uint256 i = seed % models.length; Model storage m = models[i];
        bool expected = !m.cancelled && m.approved < m.total && (m.deadline == 0 || block.timestamp < m.deadline);
        (bool ok,) = address(escrow).call(abi.encodeCall(escrow.cancel, (i + 1))); require(ok == expected, "Refund result mismatch");
        if (ok) { m.cancelled = true; m.refund = m.total - m.approved; refunded += m.refund; }
    }
    function advance(uint32 secondsSeed) external { vm.warp(block.timestamp + secondsSeed % 2000); }
    function donate(uint96 seed) external { uint256 value = uint256(seed) % 1000; token.transfer(address(escrow), value); donations += value; }
}
contract RunwayMilestonesInvariantTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    struct FuzzSelector { address addr; bytes4[] selectors; }
    MockMUSD token; RunwayMilestones escrow; MilestoneHandler handler;
    function setUp() public { vm.warp(1000); token = new MockMUSD(); escrow = new RunwayMilestones(address(token)); handler = new MilestoneHandler(escrow, token); handler.create(100, true); handler.create(500, false); }
    function targetContracts() external view returns (address[] memory targets) { targets = new address[](1); targets[0] = address(handler); }
    function targetSelectors() external view returns (FuzzSelector[] memory targets) {
        bytes4[] memory selectors = new bytes4[](6); selectors[0] = handler.create.selector; selectors[1] = handler.approve.selector; selectors[2] = handler.claim.selector; selectors[3] = handler.cancel.selector; selectors[4] = handler.advance.selector; selectors[5] = handler.donate.selector;
        targets = new FuzzSelector[](1); targets[0] = FuzzSelector(address(handler), selectors);
    }
    function invariant_independentEscrowAccountingAndDiscovery() public view {
        uint256 obligations; require(escrow.escrowCount() == handler.count());
        uint256[] memory sent = escrow.getSenderEscrowIds(address(handler), 0, 100); require(sent.length == handler.count());
        for (uint256 i; i < handler.count(); ++i) {
            MilestoneHandler.Model memory m = handler.model(i); RunwayMilestones.Escrow memory e = escrow.getEscrow(i + 1);
            require(e.sender == address(handler) && e.recipient == m.recipient && e.total == m.total && e.autoReleaseAt == m.deadline);
            require(e.claimed == m.paid && e.refunded == m.refund && e.approvedAmount == m.approved && e.cancelled == m.cancelled);
            uint256 entitlement = !m.cancelled && m.deadline != 0 && block.timestamp >= m.deadline ? m.total : m.approved;
            require(e.claimed <= entitlement && escrow.claimable(i + 1) == entitlement - m.paid && sent[i] == i + 1);
            (uint256[] memory a, bool[] memory approved) = escrow.getMilestones(i + 1);
            for (uint256 j; j < 3; ++j) require(a[j] == m.amounts[j] && approved[j] == (m.bitmap & (uint256(1) << j) != 0));
            obligations += m.total - m.paid - m.refund;
        }
        require(escrow.outstandingObligations() == obligations && token.balanceOf(address(escrow)) == obligations + handler.donations());
    }
    function invariant_actualActorBalances() public view {
        require(token.balanceOf(address(handler)) == handler.initial() - handler.deposited() - handler.donations() + handler.refunded());
        uint256 all = token.balanceOf(address(handler)) + token.balanceOf(address(escrow));
        for (uint256 i; i < 3; ++i) { address actor = address(uint160(0xBEEF + i)); require(token.balanceOf(actor) == handler.payouts(actor)); all += token.balanceOf(actor); }
        require(all == handler.initial(), "Independent conservation failed");
    }
}
