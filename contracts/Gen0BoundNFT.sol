// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * GEN-0 Bound NFT
 *
 * Arc Mainnet:
 * - Chain ID: 5042
 * - USDC ERC-20 facade: 0x3600000000000000000000000000000000000000
 * - USDC ERC-20 has 6 decimals
 *
 * Rules:
 * - One mint per wallet, enforced onchain.
 * - Mint price is exactly 1 USDC.
 * - Mint fee is forwarded to the immutable GEN-0 fee recipient.
 * - Tokens are soulbound: transfers are disabled after mint.
 * - No owner/admin mint function.
 */
contract Gen0BoundNFT is ERC721, Ownable {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdc;
    address public immutable feeRecipient;
    uint256 public constant MINT_PRICE = 1_000_000; // 1 USDC, 6 decimals

    uint256 private _nextTokenId = 1;
    string private _metadataURI;

    mapping(address => bool) public hasMinted;

    error AlreadyMinted();
    error IncorrectPayment();
    error ZeroAddress();
    error NonTransferable();

    event Gen0BoundMinted(address indexed wallet, uint256 indexed tokenId, uint256 price);

    constructor(
        address usdc_,
        address feeRecipient_,
        string memory metadataURI_
    ) ERC721("GEN-0 Bound", "GEN0B") Ownable(msg.sender) {
        if (usdc_ == address(0) || feeRecipient_ == address(0)) revert ZeroAddress();

        usdc = IERC20(usdc_);
        feeRecipient = feeRecipient_;
        _metadataURI = metadataURI_;
    }

    function mint() external {
        if (hasMinted[msg.sender]) revert AlreadyMinted();

        hasMinted[msg.sender] = true;
        uint256 tokenId = _nextTokenId++;

        usdc.safeTransferFrom(msg.sender, feeRecipient, MINT_PRICE);
        _safeMint(msg.sender, tokenId);

        emit Gen0BoundMinted(msg.sender, tokenId, MINT_PRICE);
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return _metadataURI;
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    /**
     * Soulbound enforcement.
     * Minting (from == address(0)) is allowed.
     * Burning/transfers are disabled.
     */
    function _update(address to, uint256 tokenId, address auth)
        internal
        override
        returns (address)
    {
        address from = _ownerOf(tokenId);

        if (from != address(0) && to != address(0)) {
            revert NonTransferable();
        }

        return super._update(to, tokenId, auth);
    }

    function setMetadataURI(string calldata metadataURI_) external onlyOwner {
        _metadataURI = metadataURI_;
    }
}
