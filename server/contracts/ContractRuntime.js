/**
 * A miniature, in-process execution environment that reproduces the parts of
 * EVM semantics an application actually observes: a message sender, blocks,
 * transaction hashes, receipts, gas accounting, event logs, and reverts.
 *
 * It has no network, no keys and no chain — `crypto` is Node's built-in module,
 * used only as a hash function. Contracts written against this runtime use the
 * same call shape they would use against a deployed contract, which is what
 * lets the adapter in `SimulatedContractAdapter.js` be swapped for a real
 * provider without the API layer changing.
 */

const crypto = require("crypto");

/** Thrown by contract code to abort a transaction and roll back its writes. */
class ContractRevert extends Error {
  constructor(reason) {
    super(`execution reverted: ${reason}`);
    this.name = "ContractRevert";
    this.reason = reason;
  }
}

/** `require(cond, reason)` — mirrors Solidity's guard so contract code reads the same. */
function require_(condition, reason) {
  if (!condition) throw new ContractRevert(reason);
}

const GAS_BASE = 21000n;
const GAS_PER_STORAGE_WRITE = 20000n;
const GAS_PER_LOG = 1875n;

class ContractRuntime {
  #chainId;
  #blockTime;
  #genesisTimestamp;
  #blockNumber = 0;
  #nonce = 0;
  #receipts = [];
  #logs = [];

  constructor({ chainId = 31337, blockTime = 12, genesisTimestamp } = {}) {
    this.#chainId = chainId;
    this.#blockTime = blockTime;
    // Captured once. Every later timestamp is derived from the block height, so
    // a given sequence of transactions always produces the same relative chain.
    this.#genesisTimestamp = genesisTimestamp ?? Math.floor(Date.now() / 1000);
  }

  get chainId() {
    return this.#chainId;
  }

  get blockNumber() {
    return this.#blockNumber;
  }

  get timestamp() {
    return this.#genesisTimestamp + this.#blockNumber * this.#blockTime;
  }

  /**
   * Deterministic 20-byte address derived from a label. Real deployments derive
   * addresses from a public key; here a label keeps demo accounts stable across
   * restarts, which matters for a fixture-driven UI.
   */
  static addressOf(label) {
    const digest = crypto.createHash("sha256").update(String(label)).digest("hex");
    return `0x${digest.slice(0, 40)}`;
  }

  static isAddress(value) {
    return typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value);
  }

  /**
   * Execute a state-changing call and mine it into the next block.
   *
   * `executor(ctx)` receives `{ sender, blockNumber, timestamp, emit, touch }`.
   * Throwing `ContractRevert` produces a `status: 0` receipt and rolls contract
   * state back, all-or-nothing, exactly as a failed on-chain transaction does.
   * Rollback is driven by the optional `state` handle — `{ capture, restore }` —
   * which the contract supplies so the runtime stays agnostic about layout.
   */
  sendTransaction({ to, from, method, args = [] }, executor, state = null) {
    require_(ContractRuntime.isAddress(from), `invalid sender address "${from}"`);

    const nonce = this.#nonce++;
    this.#blockNumber += 1;

    const blockNumber = this.#blockNumber;
    const timestamp = this.timestamp;
    const hash = this.#hashTransaction({ nonce, from, to, method, args });

    const pendingLogs = [];
    let storageWrites = 0n;

    const ctx = {
      sender: from,
      blockNumber,
      timestamp,
      emit(event, payload) {
        pendingLogs.push({ event, args: payload });
      },
      /** Contracts call this per storage slot written so gas reflects real work. */
      touch(slots = 1) {
        storageWrites += BigInt(slots);
      },
    };

    const snapshot = state ? state.capture() : null;

    let result;
    try {
      result = executor(ctx);
    } catch (error) {
      if (error instanceof ContractRevert) {
        if (state) state.restore(snapshot);
        const receipt = this.#record({
          hash,
          nonce,
          blockNumber,
          timestamp,
          from,
          to,
          method,
          args,
          status: 0,
          gasUsed: GAS_BASE.toString(),
          revertReason: error.reason,
          logs: [],
        });
        return { receipt, result: null };
      }
      // A genuine bug rather than a guard: still roll back so the ledger is
      // never left half-written, then let it surface as a 500.
      if (state) state.restore(snapshot);
      throw error;
    }

    const gasUsed =
      GAS_BASE +
      storageWrites * GAS_PER_STORAGE_WRITE +
      BigInt(pendingLogs.length) * GAS_PER_LOG;

    const logs = pendingLogs.map((entry, index) => {
      const log = {
        address: to,
        blockNumber,
        timestamp,
        transactionHash: hash,
        logIndex: this.#logs.length + index,
        event: entry.event,
        args: entry.args,
      };
      return log;
    });
    this.#logs.push(...logs);

    const receipt = this.#record({
      hash,
      nonce,
      blockNumber,
      timestamp,
      from,
      to,
      method,
      args,
      status: 1,
      gasUsed: gasUsed.toString(),
      revertReason: null,
      logs,
    });

    return { receipt, result };
  }

  /** Read-only execution: no block, no receipt, no log. */
  call(executor) {
    return executor({
      blockNumber: this.#blockNumber,
      timestamp: this.timestamp,
    });
  }

  getReceipt(hash) {
    return this.#receipts.find((receipt) => receipt.hash === hash) ?? null;
  }

  /** Newest first, which is the order every UI wants to render. */
  getTransactions({ limit = 50, address } = {}) {
    let receipts = [...this.#receipts].reverse();
    if (address) {
      const needle = address.toLowerCase();
      receipts = receipts.filter(
        (receipt) =>
          receipt.from.toLowerCase() === needle ||
          receipt.logs.some((log) =>
            Object.values(log.args).some(
              (value) => typeof value === "string" && value.toLowerCase() === needle
            )
          )
      );
    }
    return receipts.slice(0, limit);
  }

  getLogs({ event, limit = 100 } = {}) {
    let logs = [...this.#logs].reverse();
    if (event) logs = logs.filter((log) => log.event === event);
    return logs.slice(0, limit);
  }

  #hashTransaction(payload) {
    const encoded = JSON.stringify(payload, (_key, value) =>
      typeof value === "bigint" ? value.toString() : value
    );
    return `0x${crypto
      .createHash("sha256")
      .update(`${this.#chainId}:${encoded}`)
      .digest("hex")}`;
  }

  #record(receipt) {
    this.#receipts.push(receipt);
    return receipt;
  }
}

module.exports = { ContractRuntime, ContractRevert, require_ };
