// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

/// @notice Fully funded, linear MUSD entitlements. Claims always pay the immutable recipient.
/// @dev A bounded schedule fee is charged to the sender on top of the funded total and sent
///      directly to the fee recipient. Recipients always receive 100% of the funded total, the fee
///      never enters escrow, and it is not refunded on cancellation.
contract RunwayPayments is ReentrancyGuard, Ownable2Step {
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

    /// @notice Hard ceilings the owner can never exceed: 1% and 100 MUSD per schedule.
    uint16 public constant MAX_FEE_BPS = 100;
    uint256 public constant MAX_FEE_CAP = 100e18;
    uint256 private constant BPS = 10_000;

    IERC20 public immutable musd;
    address public feeRecipient;
    uint16 public feeBps;
    uint256 public feeCap;
    uint256 public totalFeesCollected;
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
    error FeeAboveMaximum();

    event ScheduleCreated(uint256 indexed scheduleId, address indexed sender, address indexed recipient, uint256 total, uint64 start, uint64 end, bytes32 referenceHash);
    event Claimed(uint256 indexed scheduleId, address indexed recipient, uint256 amount);
    event Cancelled(uint256 indexed scheduleId, address indexed sender, uint256 refund, uint256 vested);
    event FeeCharged(uint256 indexed scheduleId, address indexed payer, address indexed feeRecipient, uint256 fee);
    event FeeConfigUpdated(address indexed feeRecipient, uint16 feeBps, uint256 feeCap);

    constructor(address token, address initialFeeRecipient, uint16 initialFeeBps, uint256 initialFeeCap)
        Ownable(msg.sender)
    {
        if (token == address(0) || token.code.length == 0) revert InvalidInput();
        musd = IERC20(token);
        _setFeeConfig(initialFeeRecipient, initialFeeBps, initialFeeCap);
    }

    /// @notice Fee for funding a schedule of `totalAmount`, paid by the sender in addition to it.
    function scheduleFee(uint256 totalAmount) public view returns (uint256) {
        if (feeBps == 0) return 0;
        return Math.min(Math.mulDiv(totalAmount, feeBps, BPS), feeCap);
    }

    /// @notice Charges the current fee. Prefer `createScheduleWithMaxFee` to bound it.
    function createSchedule(address recipient, uint256 totalAmount, uint64 start, uint64 end, bytes32 referenceHash)
        external nonReentrant returns (uint256 id)
    {
        id = _create(recipient, totalAmount, start, end, referenceHash, type(uint256).max);
    }

    /// @notice Reverts if the fee at execution exceeds the `maxFee` the sender reviewed.
    function createScheduleWithMaxFee(
        address recipient,
        uint256 totalAmount,
        uint64 start,
        uint64 end,
        bytes32 referenceHash,
        uint256 maxFee
    ) external nonReentrant returns (uint256 id) {
        id = _create(recipient, totalAmount, start, end, referenceHash, maxFee);
    }

    function setFeeConfig(address newFeeRecipient, uint16 newFeeBps, uint256 newFeeCap) external onlyOwner {
        _setFeeConfig(newFeeRecipient, newFeeBps, newFeeCap);
    }

    function _setFeeConfig(address newFeeRecipient, uint16 newFeeBps, uint256 newFeeCap) private {
        if (newFeeBps > MAX_FEE_BPS || newFeeCap > MAX_FEE_CAP) revert FeeAboveMaximum();
        if (newFeeBps != 0 && (newFeeRecipient == address(0) || newFeeRecipient == address(this) || newFeeCap == 0)) {
            revert InvalidInput();
        }
        feeRecipient = newFeeRecipient;
        feeBps = newFeeBps;
        feeCap = newFeeCap;
        emit FeeConfigUpdated(newFeeRecipient, newFeeBps, newFeeCap);
    }

    function _create(
        address recipient,
        uint256 totalAmount,
        uint64 start,
        uint64 end,
        bytes32 referenceHash,
        uint256 maxFee
    ) private returns (uint256 id) {
        if (recipient == address(0) || recipient == address(this) || totalAmount == 0 || start < block.timestamp || end <= start) revert InvalidInput();
        uint256 fee = scheduleFee(totalAmount);
        if (fee > maxFee) revert FeeAboveMaximum();
        uint256 beforeBalance = musd.balanceOf(address(this));
        musd.safeTransferFrom(msg.sender, address(this), totalAmount);
        if (musd.balanceOf(address(this)) - beforeBalance != totalAmount) revert UnsupportedToken();
        id = ++scheduleCount;
        schedules[id] = Schedule(msg.sender, recipient, totalAmount, start, end, 0, false, 0, referenceHash);
        senderIds[msg.sender].push(id);
        recipientIds[recipient].push(id);
        outstandingObligations += totalAmount;
        emit ScheduleCreated(id, msg.sender, recipient, totalAmount, start, end, referenceHash);
        if (fee != 0) {
            address to = feeRecipient;
            totalFeesCollected += fee;
            musd.safeTransferFrom(msg.sender, to, fee);
            emit FeeCharged(id, msg.sender, to, fee);
        }
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
