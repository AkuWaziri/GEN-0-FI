// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * GEN-0 Bound NFT
 *
 * Arc Mainnet
 * - Chain ID: 5042
 * - USDC: 0x3600000000000000000000000000000000000000
 * - Fee recipient: 0x5Bce25397eEfbc76f6479e6838c00a5115dbEA4c
 *
 * The artwork is supplied through a permanent metadata URI at deployment.
 * This keeps the final artwork independent of the application frontend.
 *
 * Rules:
 * - Exactly 1 USDC per mint
 * - One mint per wallet
 * - USDC goes directly to the immutable GEN-0 fee wallet
 * - Tokens are soulbound after mint
 * - No admin mint
 */
contract Gen0BoundNFT is ERC721 {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdc;
    address public immutable feeRecipient;
    string private _metadataURI;

    uint256 public constant MINT_PRICE = 1_000_000;
    uint256 private _nextTokenId = 1;

    mapping(address => bool) public hasMinted;

    error AlreadyMinted();
    error ZeroAddress();
    error EmptyMetadataURI();
    error NonTransferable();

    event Gen0BoundMinted(
        address indexed wallet,
        uint256 indexed tokenId,
        uint256 price
    );

    constructor(address usdc_, address feeRecipient_, string memory metadataURI_)
        ERC721("GEN-0 Bound", "GEN0B")
    {
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
        if (hasMinted[msg.sender]) revert AlreadyMinted();

        uint256 tokenId = _nextTokenId++;

        usdc.safeTransferFrom(msg.sender, feeRecipient, MINT_PRICE);

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

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
