// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Fully funded, immutable-recipient milestone escrow. Deadlines enable claims, never automatic transfers.
contract RunwayMilestones is ReentrancyGuard {
    using SafeERC20 for IERC20;
    struct Escrow {
        address sender;
        address recipient;
        uint64 createdAt;
        uint64 autoReleaseAt;
        uint8 milestoneCount;
        bool cancelled;
        uint256 total;
        uint256 approvedAmount;
        uint256 claimed;
        uint256 refunded;
        bytes32 referenceHash;
    }
    IERC20 public immutable musd;
    uint256 public escrowCount;
    uint256 public outstandingObligations;
    mapping(uint256 => Escrow) private escrows;
    mapping(uint256 => uint256[]) private milestoneAmounts;
    mapping(uint256 => uint256) private approvedBitmap;
    mapping(address => uint256[]) private senderIds;
    mapping(address => uint256[]) private recipientIds;

    error InvalidInput();
    error UnknownEscrow();
    error Unauthorized();
    error AlreadyCancelled();
    error AlreadyApproved();
    error AutoReleased();
    error NothingToClaim();
    error NothingToRefund();
    error UnsupportedToken();
    event EscrowCreated(uint256 indexed escrowId, address indexed sender, address indexed recipient, uint256 total, uint8 milestoneCount, uint64 autoReleaseAt, bytes32 referenceHash);
    event MilestoneApproved(uint256 indexed escrowId, uint8 indexed index, uint256 amount);
    event Claimed(uint256 indexed escrowId, address indexed recipient, uint256 amount);
    event Cancelled(uint256 indexed escrowId, address indexed sender, uint256 refund);

    constructor(address token) {
        if (token == address(0) || token.code.length == 0) revert InvalidInput();
        musd = IERC20(token);
    }
    function createEscrow(address recipient, uint256[] calldata amounts, uint64 autoReleaseAt, bytes32 referenceHash) external nonReentrant returns (uint256 id) {
        if (recipient == address(0) || recipient == address(this) || recipient == msg.sender || amounts.length == 0 || amounts.length > 20 || (autoReleaseAt != 0 && autoReleaseAt <= block.timestamp)) revert InvalidInput();
        uint256 total;
        for (uint256 i; i < amounts.length; ++i) {
            if (amounts[i] == 0) revert InvalidInput();
            total += amounts[i];
        }
        uint256 beforeBalance = musd.balanceOf(address(this));
        musd.safeTransferFrom(msg.sender, address(this), total);
        uint256 afterBalance = musd.balanceOf(address(this));
        if (afterBalance < beforeBalance || afterBalance - beforeBalance != total) revert UnsupportedToken();
        id = ++escrowCount;
        escrows[id] = Escrow(msg.sender, recipient, uint64(block.timestamp), autoReleaseAt, uint8(amounts.length), false, total, 0, 0, 0, referenceHash);
        milestoneAmounts[id] = amounts;
        senderIds[msg.sender].push(id);
        recipientIds[recipient].push(id);
        outstandingObligations += total;
        emit EscrowCreated(id, msg.sender, recipient, total, uint8(amounts.length), autoReleaseAt, referenceHash);
    }
    function approveMilestone(uint256 id, uint8 index) external nonReentrant {
        Escrow storage e = existing(id);
        if (e.sender != msg.sender) revert Unauthorized();
        if (e.cancelled) revert AlreadyCancelled();
        if (e.autoReleaseAt != 0 && block.timestamp >= e.autoReleaseAt) revert AutoReleased();
        if (index >= e.milestoneCount) revert InvalidInput();
        uint256 mask = uint256(1) << index;
        if (approvedBitmap[id] & mask != 0) revert AlreadyApproved();
        approvedBitmap[id] |= mask;
        uint256 value = milestoneAmounts[id][index];
        e.approvedAmount += value;
        emit MilestoneApproved(id, index, value);
    }
    function claim(uint256 id) external nonReentrant {
        Escrow storage e = existing(id);
        uint256 value = releasable(e) - e.claimed;
        if (value == 0) revert NothingToClaim();
        e.claimed += value;
        outstandingObligations -= value;
        musd.safeTransfer(e.recipient, value);
        emit Claimed(id, e.recipient, value);
    }
    function cancel(uint256 id) external nonReentrant {
        Escrow storage e = existing(id);
        if (e.sender != msg.sender) revert Unauthorized();
        if (e.cancelled) revert AlreadyCancelled();
        if (e.autoReleaseAt != 0 && block.timestamp >= e.autoReleaseAt) revert AutoReleased();
        uint256 refund = e.total - e.approvedAmount;
        if (refund == 0) revert NothingToRefund();
        e.cancelled = true;
        e.refunded = refund;
        outstandingObligations -= refund;
        musd.safeTransfer(e.sender, refund);
        emit Cancelled(id, e.sender, refund);
    }
    function claimable(uint256 id) external view returns (uint256) {
        Escrow storage e = existing(id);
        return releasable(e) - e.claimed;
    }
    function getEscrow(uint256 id) external view returns (Escrow memory) { return existing(id); }
    function getMilestones(uint256 id) external view returns (uint256[] memory amounts, bool[] memory approved) {
        Escrow storage e = existing(id);
        amounts = milestoneAmounts[id];
        approved = new bool[](e.milestoneCount);
        for (uint256 i; i < e.milestoneCount; ++i) approved[i] = approvedBitmap[id] & (uint256(1) << i) != 0;
    }
    function getSenderEscrowIds(address sender, uint256 offset, uint256 limit) external view returns (uint256[] memory) { return page(senderIds[sender], offset, limit); }
    function getRecipientEscrowIds(address recipient, uint256 offset, uint256 limit) external view returns (uint256[] memory) { return page(recipientIds[recipient], offset, limit); }
    function releasable(Escrow storage e) private view returns (uint256) {
        return !e.cancelled && e.autoReleaseAt != 0 && block.timestamp >= e.autoReleaseAt ? e.total : e.approvedAmount;
    }
    function existing(uint256 id) private view returns (Escrow storage e) {
        e = escrows[id];
        if (e.sender == address(0)) revert UnknownEscrow();
    }
    function page(uint256[] storage ids, uint256 offset, uint256 limit) private view returns (uint256[] memory result) {
        if (limit == 0 || limit > 100) revert InvalidInput();
        uint256 count = offset >= ids.length ? 0 : ids.length - offset;
        if (count > limit) count = limit;
        result = new uint256[](count);
        for (uint256 i; i < count; ++i) result[i] = ids[offset + i];
    }
}
