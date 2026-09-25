# GEN-0 Bound NFT deployment

Target network: Arc Mainnet
- Chain ID: 5042
- RPC: https://rpc.mainnet.arc.io
- Explorer: https://explorer.arc.io
- USDC ERC-20: 0x3600000000000000000000000000000000000000
- USDC decimals: 6
- GEN-0 fee wallet: 0x5Bce25397eEfbc76f6479e6838c00a5115dbEA4c

## Final artwork

The supplied GEN-0 Bound artwork is the canonical collection image.

Before deployment, host the exact artwork and a metadata JSON at a permanent HTTPS/IPFS/Arweave location. The metadata JSON should contain at minimum:

```json
{
  "name": "GEN-0 Bound",
  "description": "A one-per-wallet soulbound GEN-0FI collectible on Arc.",
  "image": "<PERMANENT_ARTWORK_URI>",
  "attributes": [
    { "trait_type": "Collection", "value": "GEN-0FI" },
    { "trait_type": "Type", "value": "Soulbound" },
    { "trait_type": "Network", "value": "Arc" }
  ]
}
```

Do not use a temporary upload URL.

## Constructor parameters

Deploy `contracts/Gen0BoundNFT.sol` with:

1. `usdc_`
   `0x3600000000000000000000000000000000000000`

2. `feeRecipient_`
   `0x5Bce25397eEfbc76f6479e6838c00a5115dbEA4c`

3. `metadataURI_`
   The permanent metadata JSON URI containing the final supplied artwork.

## Onchain rules

- Mint price: exactly 1 USDC.
- One mint per wallet, enforced by `hasMinted`.
- The 1 USDC is transferred directly to the immutable GEN-0 fee wallet.
- NFT transfers are disabled after mint, making the NFT soulbound.
- There is no admin mint function.
- The metadata URI is fixed at deployment.
- `tokenURI()` returns the fixed metadata URI for every minted token.

## Deployment state

No production GEN-0 Bound contract address is recorded yet.

Do not enable a live MINT button until the contract is deployed on Arc Mainnet and its address is configured in GEN-0FI.
