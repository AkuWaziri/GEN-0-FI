// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/**
 * @title GEN-0 Fixed Supply Token
 * @notice Plain ERC-20 with configurable name, symbol, decimals and fixed initial supply.
 * @dev No owner, mint, burn, pause, tax or upgrade mechanism.
 */
contract Gen0Token {
    string private _name;
    string private _symbol;
    uint8 private _decimals;

    uint256 public totalSupply;
    mapping(address => uint256) private _balances;
    mapping(address => mapping(address => uint256)) private _allowances;

    error InvalidName();
    error InvalidSymbol();
    error InvalidReceiver();
    error InvalidDecimals();
    error InvalidSupply();
    error InsufficientBalance();
    error InsufficientAllowance();
    error InvalidSender();
    error InvalidSpender();

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor(
        string memory name_,
        string memory symbol_,
        uint8 decimals_,
        uint256 initialSupply_,
        address receiver_
    ) {
        if (bytes(name_).length == 0 || bytes(name_).length > 64) revert InvalidName();
        if (bytes(symbol_).length == 0 || bytes(symbol_).length > 16) revert InvalidSymbol();
        if (decimals_ > 18) revert InvalidDecimals();
        if (initialSupply_ == 0) revert InvalidSupply();
        if (receiver_ == address(0)) revert InvalidReceiver();

        _name = name_;
        _symbol = symbol_;
        _decimals = decimals_;

        uint256 scaledSupply = initialSupply_ * (10 ** uint256(decimals_));
        totalSupply = scaledSupply;
        _balances[receiver_] = scaledSupply;

        emit Transfer(address(0), receiver_, scaledSupply);
    }

    function name() external view returns (string memory) {
        return _name;
    }

    function symbol() external view returns (string memory) {
        return _symbol;
    }

    function decimals() external view returns (uint8) {
        return _decimals;
    }

    function balanceOf(address account) external view returns (uint256) {
        return _balances[account];
    }

    function allowance(address owner, address spender) external view returns (uint256) {
        return _allowances[owner][spender];
    }

    function transfer(address to, uint256 value) external returns (bool) {
        _transfer(msg.sender, to, value);
        return true;
    }

    function approve(address spender, uint256 value) external returns (bool) {
        if (spender == address(0)) revert InvalidSpender();
        _allowances[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        if (from == address(0)) revert InvalidSender();
        uint256 currentAllowance = _allowances[from][msg.sender];
        if (currentAllowance < value) revert InsufficientAllowance();
        unchecked {
            _allowances[from][msg.sender] = currentAllowance - value;
        }
        emit Approval(from, msg.sender, currentAllowance - value);
        _transfer(from, to, value);
        return true;
    }

    function _transfer(address from, address to, uint256 value) internal {
        if (from == address(0)) revert InvalidSender();
        if (to == address(0)) revert InvalidReceiver();

        uint256 fromBalance = _balances[from];
        if (fromBalance < value) revert InsufficientBalance();

        unchecked {
            _balances[from] = fromBalance - value;
            _balances[to] += value;
        }
        emit Transfer(from, to, value);
    }
}
