# GEN-0 Bound NFT deployment

Target network: Arc Mainnet
- Chain ID: 5042
- RPC: https://rpc.mainnet.arc.io
- Explorer: https://explorer.arc.io
- USDC ERC-20: 0x3600000000000000000000000000000000000000
- USDC decimals: 6
- GEN-0 fee wallet: 0x5Bce25397eEfbc76f6479e6838c00a5115dbEA4c

## Constructor parameters

Deploy `contracts/Gen0BoundNFT.sol` with:

1. `usdc_`
   `0x3600000000000000000000000000000000000000`

2. `feeRecipient_`
   `0x5Bce25397eEfbc76f6479e6838c00a5115dbEA4c`

3. `metadataURI_`
   The final HTTPS/IPFS/Arweave metadata JSON URI for the GEN-0 Bound artwork.

## Onchain rules

- Mint price: exactly 1 USDC.
- One mint per wallet, enforced by `hasMinted`.
- The 1 USDC is transferred directly to the immutable GEN-0 fee wallet.
- NFT transfers are disabled after mint, making the NFT soulbound.
- There is no admin mint function.
- The metadata URI can be updated by the deployer before the collection is finalized.

## Important

Do not deploy until the final metadata URI is confirmed. The deployment transaction must be approved by the connected deployer wallet on Arc Mainnet.

After deployment, save the resulting contract address in GEN-0FI as the production GEN-0 Bound NFT contract address.