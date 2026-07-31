/**
 * Single place where the API decides which contract backend it is talking to.
 *
 * Today that is always the in-memory simulation. To move RentVerse onto a real
 * chain, implement `read`/`write`/`status`/`accounts`/`resolve`/`transactions`/
 * `events` against ethers (or viem) and return it from `createAdapter` when
 * `LEDGER_ADAPTER=onchain`. Everything above this file is already agnostic.
 */

const { SimulatedContractAdapter } = require("./ContractAdapter");

function createAdapter() {
  const kind = process.env.LEDGER_ADAPTER || "simulated";

  switch (kind) {
    case "simulated":
      return new SimulatedContractAdapter({
        name: process.env.LEDGER_TOKEN_NAME,
        symbol: process.env.LEDGER_TOKEN_SYMBOL,
        genesisSupply: process.env.LEDGER_GENESIS_SUPPLY,
      });
    default:
      throw new Error(
        `unsupported LEDGER_ADAPTER "${kind}" — only "simulated" is implemented`
      );
  }
}

/** Process-wide instance; the chain outlives individual requests. */
let adapter = null;

function getAdapter() {
  if (!adapter) adapter = createAdapter();
  return adapter;
}

module.exports = { getAdapter, createAdapter };
