import solc from 'solc';

export const GEN0_TOKEN_SOURCE = "// SPDX-License-Identifier: MIT\npragma solidity ^0.8.30;\n\n/**\n * @title GEN-0 Fixed Supply Token\n * @notice Plain ERC-20 with configurable name, symbol, decimals and fixed initial supply.\n * @dev No owner, mint, burn, pause, tax or upgrade mechanism.\n */\ncontract Gen0Token {\n    string private _name;\n    string private _symbol;\n    uint8 private _decimals;\n\n    uint256 public totalSupply;\n    mapping(address => uint256) private _balances;\n    mapping(address => mapping(address => uint256)) private _allowances;\n\n    error InvalidName();\n    error InvalidSymbol();\n    error InvalidReceiver();\n    error InvalidDecimals();\n    error InvalidSupply();\n    error InsufficientBalance();\n    error InsufficientAllowance();\n    error InvalidSender();\n    error InvalidSpender();\n\n    event Transfer(address indexed from, address indexed to, uint256 value);\n    event Approval(address indexed owner, address indexed spender, uint256 value);\n\n    constructor(\n        string memory name_,\n        string memory symbol_,\n        uint8 decimals_,\n        uint256 initialSupply_,\n        address receiver_\n    ) {\n        if (bytes(name_).length == 0 || bytes(name_).length > 64) revert InvalidName();\n        if (bytes(symbol_).length == 0 || bytes(symbol_).length > 16) revert InvalidSymbol();\n        if (decimals_ > 18) revert InvalidDecimals();\n        if (initialSupply_ == 0) revert InvalidSupply();\n        if (receiver_ == address(0)) revert InvalidReceiver();\n\n        _name = name_;\n        _symbol = symbol_;\n        _decimals = decimals_;\n\n        uint256 scaledSupply = initialSupply_ * (10 ** uint256(decimals_));\n        totalSupply = scaledSupply;\n        _balances[receiver_] = scaledSupply;\n\n        emit Transfer(address(0), receiver_, scaledSupply);\n    }\n\n    function name() external view returns (string memory) {\n        return _name;\n    }\n\n    function symbol() external view returns (string memory) {\n        return _symbol;\n    }\n\n    function decimals() external view returns (uint8) {\n        return _decimals;\n    }\n\n    function balanceOf(address account) external view returns (uint256) {\n        return _balances[account];\n    }\n\n    function allowance(address owner, address spender) external view returns (uint256) {\n        return _allowances[owner][spender];\n    }\n\n    function transfer(address to, uint256 value) external returns (bool) {\n        _transfer(msg.sender, to, value);\n        return true;\n    }\n\n    function approve(address spender, uint256 value) external returns (bool) {\n        if (spender == address(0)) revert InvalidSpender();\n        _allowances[msg.sender][spender] = value;\n        emit Approval(msg.sender, spender, value);\n        return true;\n    }\n\n    function transferFrom(address from, address to, uint256 value) external returns (bool) {\n        if (from == address(0)) revert InvalidSender();\n        uint256 currentAllowance = _allowances[from][msg.sender];\n        if (currentAllowance < value) revert InsufficientAllowance();\n        unchecked {\n            _allowances[from][msg.sender] = currentAllowance - value;\n        }\n        emit Approval(from, msg.sender, currentAllowance - value);\n        _transfer(from, to, value);\n        return true;\n    }\n\n    function _transfer(address from, address to, uint256 value) internal {\n        if (from == address(0)) revert InvalidSender();\n        if (to == address(0)) revert InvalidReceiver();\n\n        uint256 fromBalance = _balances[from];\n        if (fromBalance < value) revert InsufficientBalance();\n\n        unchecked {\n            _balances[from] = fromBalance - value;\n            _balances[to] += value;\n        }\n        emit Transfer(from, to, value);\n    }\n}\n";

export type Gen0TokenCompileInput = {
  name: string;
  symbol: string;
  decimals: number;
  initialSupply: string;
  receiver: string;
};

export function compileGen0Token(input: Gen0TokenCompileInput) {
  const compilerInput = {
    language: 'Solidity',
    sources: {
      'Gen0Token.sol': { content: GEN0_TOKEN_SOURCE },
    },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      metadata: { bytecodeHash: 'none' },
      outputSelection: {
        '*': {
          Gen0Token: ['abi', 'evm.bytecode.object'],
        },
      },
    },
  };

  const output = JSON.parse(solc.compile(JSON.stringify(compilerInput)));
  const errors = (output.errors || []).filter((item: any) => item.severity === 'error');
  if (errors.length) {
    throw new Error(errors.map((item: any) => item.formattedMessage || item.message).join('\n'));
  }

  const artifact = output.contracts?.['Gen0Token.sol']?.Gen0Token;
  const bytecode = artifact?.evm?.bytecode?.object;
  if (!bytecode) throw new Error('Solidity compiler returned no deployment bytecode.');

  return {
    abi: artifact.abi,
    bytecode: `0x${bytecode}`,
    compiler: solc.version(),
  };
}
