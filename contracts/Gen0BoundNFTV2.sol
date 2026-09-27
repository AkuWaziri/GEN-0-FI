// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * GEN-0 Bound NFT V2
 *
 * Arc Mainnet
 * - Chain ID: 5042
 * - USDC: 0x3600000000000000000000000000000000000000
 * - Fee recipient: 0x5Bce25397eEfbc76f6479e6838c00a5115dbEA4c
 *
 * Rules:
 * - Exactly 1 USDC per mint
 * - One mint per wallet
 * - USDC is transferred directly to the immutable GEN-0 fee wallet
 * - NFT is permanently non-transferable
 * - No admin mint and no metadata mutation
 */
contract Gen0BoundNFTV2 is ERC721 {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdc;
    address public immutable feeRecipient;
    string private immutable _metadataURI;

    uint256 public constant MINT_PRICE = 1_000_000;
    uint256 private _nextTokenId = 1;

    mapping(address => bool) public hasMinted;

    error AlreadyMinted();
    error ZeroAddress();
    error EmptyMetadataURI();
    error SoulboundTransfer();

    event Gen0BoundMinted(
        address indexed wallet,
        uint256 indexed tokenId,
        uint256 price
    );

    constructor(
        address usdc_,
        address feeRecipient_,
        string memory metadataURI_
    ) ERC721("GEN-0 Bound", "GEN0B") {
        if (usdc_ == address(0) || feeRecipient_ == address(0)) {
            revert ZeroAddress();
        }
        if (bytes(metadataURI_).length == 0) {
            revert EmptyMetadataURI();
        }

        usdc = IERC20(usdc_);
        feeRecipient = feeRecipient_;
        _metadataURI = metadataURI_;
    }

    function mint() external {
        if (hasMinted[msg.sender]) {
            revert AlreadyMinted();
        }

        // Payment happens before minting. A failed payment reverts the whole call.
        usdc.safeTransferFrom(msg.sender, feeRecipient, MINT_PRICE);

        uint256 tokenId = _nextTokenId++;
        hasMinted[msg.sender] = true;

        _safeMint(msg.sender, tokenId);

        emit Gen0BoundMinted(msg.sender, tokenId, MINT_PRICE);
    }

    function tokenURI(uint256 tokenId)
        public
        view
        override
        returns (string memory)
    {
        _requireOwned(tokenId);
        return _metadataURI;
    }

    function metadataURI() external view returns (string memory) {
        return _metadataURI;
    }

    // Explicitly block every public ERC-721 transfer entrypoint.
    // Minting remains possible because _safeMint calls _update directly.
    function transferFrom(
        address,
        address,
        uint256
    ) public pure override {
        revert SoulboundTransfer();
    }

    function safeTransferFrom(
        address,
        address,
        uint256
    ) public pure override {
        revert SoulboundTransfer();
    }

    function safeTransferFrom(
        address,
        address,
        uint256,
        bytes memory
    ) public pure override {
        revert SoulboundTransfer();
    }

    // Defense in depth for any internal transfer path.
    function _update(
        address to,
        uint256 tokenId,
        address auth
    ) internal override returns (address) {
        address from = _ownerOf(tokenId);

        if (from != address(0) && to != address(0)) {
            revert SoulboundTransfer();
        }

        return super._update(to, tokenId, auth);
    }
}
