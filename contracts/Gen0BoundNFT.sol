// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/Base64.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

/**
 * GEN-0 Bound NFT
 *
 * Arc Mainnet:
 * - Chain ID: 5042
 * - USDC ERC-20 facade: 0x3600000000000000000000000000000000000000
 * - USDC has 6 decimals
 *
 * Rules:
 * - One mint per wallet, enforced onchain.
 * - Mint price is exactly 1 USDC.
 * - Mint fee is forwarded directly to the immutable GEN-0 fee recipient.
 * - Tokens are soulbound: transfers are disabled after mint.
 * - No owner/admin mint or metadata mutation.
 * - Artwork and metadata are generated fully onchain.
 *
 * Each wallet receives a deterministic comic blob character. The wallet address
 * and token ID seed the character's palette, proportions and background, so the
 * same token always renders the same collectible without IPFS or a web server.
 */
contract Gen0BoundNFT is ERC721 {
    using SafeERC20 for IERC20;
    using Strings for uint256;

    IERC20 public immutable usdc;
    address public immutable feeRecipient;

    uint256 public constant MINT_PRICE = 1_000_000; // 1 USDC, 6 decimals

    uint256 private _nextTokenId = 1;

    mapping(address => bool) public hasMinted;

    error AlreadyMinted();
    error ZeroAddress();
    error NonTransferable();

    event Gen0BoundMinted(
        address indexed wallet,
        uint256 indexed tokenId,
        uint256 price
    );

    constructor(address usdc_, address feeRecipient_)
        ERC721("GEN-0 Bound", "GEN0B")
    {
        if (usdc_ == address(0) || feeRecipient_ == address(0)) {
            revert ZeroAddress();
        }

        usdc = IERC20(usdc_);
        feeRecipient = feeRecipient_;
    }

    function mint() external {
        if (hasMinted[msg.sender]) revert AlreadyMinted();

        uint256 tokenId = _nextTokenId++;

        // The payment and mint must both succeed or the whole transaction reverts.
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

        uint256 seed = uint256(keccak256(abi.encodePacked(ownerOf(tokenId), tokenId)));

        string memory background = _background(seed);
        string memory body = _bodyColor(seed);
        string memory accent = _accentColor(seed);
        string memory bgAccent = _backgroundAccent(seed);

        uint256 bodyW = 250 + (seed % 70);
        uint256 bodyH = 270 + ((seed >> 8) % 80);
        uint256 bodyX = 512 - bodyW / 2;
        uint256 bodyY = 560 - bodyH / 2;

        uint256 eyeY = 500 + ((seed >> 16) % 35);
        uint256 eyeGap = 48 + ((seed >> 24) % 25);
        uint256 eyeX1 = 512 - eyeGap;
        uint256 eyeX2 = 512 + eyeGap;

        string memory svg = string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">',
            '<rect width="1024" height="1024" fill="',
            background,
            '"/>',
            '<circle cx="160" cy="150" r="95" fill="',
            bgAccent,
            '" opacity=".28"/>',
            '<circle cx="870" cy="830" r="135" fill="',
            bgAccent,
            '" opacity=".22"/>',
            '<path d="M80 770 Q250 650 390 770 T700 760 T950 700" fill="none" stroke="',
            bgAccent,
            '" stroke-width="24" opacity=".25"/>',

            // Arms
            '<path d="M',
            Strings.toString(bodyX + 18),
            ' ',
            Strings.toString(bodyY + 210),
            ' Q',
            Strings.toString(bodyX - 70),
            ' ',
            Strings.toString(bodyY + 230),
            ' ',
            Strings.toString(bodyX - 42),
            ' ',
            Strings.toString(bodyY + 315),
            '" fill="none" stroke="#17171b" stroke-width="28" stroke-linecap="round"/>',
            '<path d="M',
            Strings.toString(bodyX + bodyW - 18),
            ' ',
            Strings.toString(bodyY + 210),
            ' Q',
            Strings.toString(bodyX + bodyW + 70),
            ' ',
            Strings.toString(bodyY + 230),
            ' ',
            Strings.toString(bodyX + bodyW + 42),
            ' ',
            Strings.toString(bodyY + 315),
            '" fill="none" stroke="#17171b" stroke-width="28" stroke-linecap="round"/>',

            // Comic blob body
            '<ellipse cx="512" cy="',
            Strings.toString(bodyY + bodyH / 2),
            '" rx="',
            Strings.toString(bodyW / 2),
            '" ry="',
            Strings.toString(bodyH / 2),
            '" fill="',
            body,
            '" stroke="#17171b" stroke-width="24"/>',

            // Highlight
            '<ellipse cx="',
            Strings.toString(bodyX + bodyW / 3),
            '" cy="',
            Strings.toString(bodyY + bodyH / 3),
            '" rx="42" ry="70" fill="#ffffff" opacity=".20" transform="rotate(-22 ',
            Strings.toString(bodyX + bodyW / 3),
            ' ',
            Strings.toString(bodyY + bodyH / 3),
            ')"/>',

            // Eyes
            '<circle cx="',
            Strings.toString(eyeX1),
            '" cy="',
            Strings.toString(eyeY),
            '" r="28" fill="#ffffff" stroke="#17171b" stroke-width="14"/>',
            '<circle cx="',
            Strings.toString(eyeX2),
            '" cy="',
            Strings.toString(eyeY),
            '" r="28" fill="#ffffff" stroke="#17171b" stroke-width="14"/>',
            '<circle cx="',
            Strings.toString(eyeX1 + 7),
            '" cy="',
            Strings.toString(eyeY + 5),
            '" r="11" fill="#17171b"/>',
            '<circle cx="',
            Strings.toString(eyeX2 + 7),
            '" cy="',
            Strings.toString(eyeY + 5),
            '" r="11" fill="#17171b"/>',

            // Comic mouth
            '<path d="M455 585 Q512 635 569 585" fill="none" stroke="#17171b" stroke-width="18" stroke-linecap="round"/>',

            // Feet
            '<ellipse cx="438" cy="',
            Strings.toString(bodyY + bodyH + 18),
            '" rx="68" ry="25" fill="#17171b"/>',
            '<ellipse cx="586" cy="',
            Strings.toString(bodyY + bodyH + 18),
            '" rx="68" ry="25" fill="#17171b"/>',

            // Accent badge
            '<circle cx="512" cy="160" r="58" fill="',
            accent,
            '" stroke="#17171b" stroke-width="16"/>',
            '<text x="512" y="176" text-anchor="middle" font-family="Arial,sans-serif" font-size="42" font-weight="900" fill="#17171b">G0</text>',

            '</svg>'
        );

        string memory image = string.concat(
            "data:image/svg+xml;base64,",
            Base64.encode(bytes(svg))
        );

        string memory json = string.concat(
            '{"name":"GEN-0 Bound #',
            tokenId.toString(),
            '","description":"A one-per-wallet, soulbound comic collectible generated fully onchain by GEN-0FI on Arc.","image":"',
            image,
            '","attributes":[{"trait_type":"Collection","value":"GEN-0FI"},{"trait_type":"Type","value":"Soulbound"},{"trait_type":"Network","value":"Arc"},{"trait_type":"Character","value":"Comic Blob"}]}'
        );

        return string.concat(
            "data:application/json;base64,",
            Base64.encode(bytes(json))
        );
    }

    function _background(uint256 seed) internal pure returns (string memory) {
        string[8] memory colors = [
            "#D9F4FF",
            "#E7D9FF",
            "#FFE3B8",
            "#D8FFD9",
            "#FFD9E8",
            "#D9E3FF",
            "#FFF5C7",
            "#D9FFF5"
        ];
        return colors[seed % colors.length];
    }

    function _bodyColor(uint256 seed) internal pure returns (string memory) {
        string[8] memory colors = [
            "#6C5CE7",
            "#FF5C7A",
            "#00A6A6",
            "#FF8A3D",
            "#3977FF",
            "#7BC043",
            "#D94EFF",
            "#FFB000"
        ];
        return colors[(seed >> 12) % colors.length];
    }

    function _accentColor(uint256 seed) internal pure returns (string memory) {
        string[8] memory colors = [
            "#7CFFCB",
            "#FFE66D",
            "#FF7BAC",
            "#8ED1FC",
            "#B8FF6A",
            "#C9A7FF",
            "#FF9F68",
            "#70F0FF"
        ];
        return colors[(seed >> 20) % colors.length];
    }

    function _backgroundAccent(uint256 seed)
        internal
        pure
        returns (string memory)
    {
        string[8] memory colors = [
            "#5B7CFF",
            "#FF6B9D",
            "#00B894",
            "#FFB142",
            "#8E6CFF",
            "#00A8FF",
            "#FF5E57",
            "#2ED573"
        ];
        return colors[(seed >> 28) % colors.length];
    }

    /**
     * Soulbound enforcement.
     * Minting (from == address(0)) is allowed.
     * Burning and transfers are disabled.
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

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
