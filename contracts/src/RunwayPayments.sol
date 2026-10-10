// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @notice Fully funded, linear MUSD entitlements. Claims always pay the immutable recipient.
contract RunwayPayments is ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Schedule {
        address sender;
        address recipient;
        uint256 total;
        uint64 start;
        uint64 end;
        uint256 claimed;
        bool cancelled;
        uint256 vestedAtCancellation;
        bytes32 referenceHash;
    }

    IERC20 public immutable musd;
    uint256 public scheduleCount;
    uint256 public outstandingObligations;
    mapping(uint256 => Schedule) private schedules;
    mapping(address => uint256[]) private senderIds;
    mapping(address => uint256[]) private recipientIds;

    error InvalidInput();
    error UnknownSchedule();
    error Unauthorized();
    error AlreadyCancelled();
    error AccrualEnded();
    error NothingToClaim();
    error UnsupportedToken();

    event ScheduleCreated(uint256 indexed scheduleId, address indexed sender, address indexed recipient, uint256 total, uint64 start, uint64 end, bytes32 referenceHash);
    event Claimed(uint256 indexed scheduleId, address indexed recipient, uint256 amount);
    event Cancelled(uint256 indexed scheduleId, address indexed sender, uint256 refund, uint256 vested);

    constructor(address token) {
        if (token == address(0) || token.code.length == 0) revert InvalidInput();
        musd = IERC20(token);
    }

    function createSchedule(address recipient, uint256 totalAmount, uint64 start, uint64 end, bytes32 referenceHash)
        external nonReentrant returns (uint256 id)
    {
        if (recipient == address(0) || recipient == address(this) || totalAmount == 0 || start < block.timestamp || end <= start) revert InvalidInput();
        uint256 beforeBalance = musd.balanceOf(address(this));
        musd.safeTransferFrom(msg.sender, address(this), totalAmount);
        if (musd.balanceOf(address(this)) - beforeBalance != totalAmount) revert UnsupportedToken();
        id = ++scheduleCount;
        schedules[id] = Schedule(msg.sender, recipient, totalAmount, start, end, 0, false, 0, referenceHash);
        senderIds[msg.sender].push(id);
        recipientIds[recipient].push(id);
        outstandingObligations += totalAmount;
        emit ScheduleCreated(id, msg.sender, recipient, totalAmount, start, end, referenceHash);
    }

    function claim(uint256 id) external nonReentrant {
        Schedule storage s = existing(id);
        uint256 amount = vested(s) - s.claimed;
        if (amount == 0) revert NothingToClaim();
        s.claimed += amount;
        outstandingObligations -= amount;
        musd.safeTransfer(s.recipient, amount);
        emit Claimed(id, s.recipient, amount);
    }

    function cancel(uint256 id) external nonReentrant {
        Schedule storage s = existing(id);
        if (msg.sender != s.sender) revert Unauthorized();
        if (s.cancelled) revert AlreadyCancelled();
        if (block.timestamp >= s.end) revert AccrualEnded();
        uint256 entitlement = vested(s);
        uint256 refund = s.total - entitlement;
        s.cancelled = true;
        s.vestedAtCancellation = entitlement;
        outstandingObligations -= refund;
        musd.safeTransfer(s.sender, refund);
        emit Cancelled(id, s.sender, refund, entitlement);
    }

    function claimable(uint256 id) external view returns (uint256) {
        Schedule storage s = existing(id);
        return vested(s) - s.claimed;
    }

    function getSchedule(uint256 id) external view returns (Schedule memory) { return existing(id); }

    function getSenderScheduleIds(address sender, uint256 offset, uint256 limit) external view returns (uint256[] memory) {
        return page(senderIds[sender], offset, limit);
    }

    function getRecipientScheduleIds(address recipient, uint256 offset, uint256 limit) external view returns (uint256[] memory) {
        return page(recipientIds[recipient], offset, limit);
    }

    function existing(uint256 id) private view returns (Schedule storage s) {
        s = schedules[id];
        if (s.sender == address(0)) revert UnknownSchedule();
    }

    function vested(Schedule storage s) private view returns (uint256) {
        if (s.cancelled) return s.vestedAtCancellation;
        if (block.timestamp <= s.start) return 0;
        if (block.timestamp >= s.end) return s.total;
        return Math.mulDiv(s.total, block.timestamp - s.start, s.end - s.start);
    }

    function page(uint256[] storage ids, uint256 offset, uint256 limit) private view returns (uint256[] memory result) {
        if (limit > 100) revert InvalidInput();
        if (offset >= ids.length || limit == 0) return new uint256[](0);
        uint256 length = Math.min(limit, ids.length - offset);
        result = new uint256[](length);
        for (uint256 i; i < length; ++i) result[i] = ids[offset + i];
    }
}
