/**
 * The contract-integration seam.
 *
 * The API layer never talks to `TokenLedger` directly — it talks to an adapter
 * exposing `read(method, args)` / `write(method, from, args)`. That is the same
 * call/send split every real client library uses, so pointing RentVerse at a
 * deployed ERC-20 later means writing an `EthersContractAdapter` with these two
 * methods and changing one line in `index.js`. No controller, route or React
 * component has to change.
 *
 * `SimulatedContractAdapter` is the in-memory implementation: real semantics,
 * zero chain dependencies.
 */

const { ContractRuntime } = require("./ContractRuntime");
const { TokenLedger } = require("./TokenLedger");
const { formatUnits } = require("./units");

/** Demo participants. Deterministic addresses keep the UI stable across restarts. */
const DEMO_ACCOUNTS = [
  { label: "treasury", name: "RentVerse Treasury" },
  { label: "alice", name: "Alice" },
  { label: "bob", name: "Bob" },
  { label: "carol", name: "Carol" },
];

class SimulatedContractAdapter {
  #runtime;
  #ledger;
  #accounts;
  #config;

  constructor(config = {}) {
    // Drop undefined keys first — callers pass `process.env.X` straight through
    // and an unset var must fall back to the default, not overwrite it.
    const provided = Object.fromEntries(
      Object.entries(config).filter(([, value]) => value !== undefined)
    );
    this.#config = {
      name: "RentVerse Token",
      symbol: "RVT",
      decimals: 18,
      chainId: 31337,
      genesisSupply: "1000000",
      ...provided,
    };
    this.#bootstrap();
  }

  get kind() {
    return "simulated";
  }

  /** Chain-level status, shaped like `eth_chainId` + `eth_blockNumber`. */
  status() {
    return {
      adapter: this.kind,
      chainId: this.#runtime.chainId,
      blockNumber: this.#runtime.blockNumber,
      timestamp: this.#runtime.timestamp,
      contract: this.#ledger.address,
      connected: true,
    };
  }

  /** Named accounts, so the UI and API can use "alice" instead of a hex blob. */
  accounts() {
    return this.#accounts.map((account) => ({
      ...account,
      balance: this.#ledger.balanceOf(account.address).toString(),
      balanceFormatted: formatUnits(
        this.#ledger.balanceOf(account.address),
        this.#ledger.decimals
      ),
    }));
  }

  /**
   * Resolve "alice" or a raw 0x address to a checksummed-lowercase address.
   * The label lookup is the simulation's stand-in for an ENS resolver.
   */
  resolve(identifier) {
    if (identifier === null || identifier === undefined || identifier === "") {
      throw new TypeError("address is required");
    }
    if (ContractRuntime.isAddress(identifier)) return identifier.toLowerCase();

    const match = this.#accounts.find(
      (account) => account.label.toLowerCase() === String(identifier).toLowerCase()
    );
    if (!match) {
      throw new TypeError(
        `unknown address or label "${identifier}" (known labels: ${this.#accounts
          .map((a) => a.label)
          .join(", ")})`
      );
    }
    return match.address;
  }

  // ── The two-method contract interface ───────────────────────────────────

  /** `eth_call` equivalent: view methods, no gas, no receipt. */
  read(method, args = []) {
    const ledger = this.#ledger;
    const views = {
      metadata: () => ledger.metadata(),
      totalSupply: () => ledger.totalSupply().toString(),
      balanceOf: (account) => {
        const address = this.resolve(account);
        const balance = ledger.balanceOf(address);
        return {
          address,
          balance: balance.toString(),
          balanceFormatted: formatUnits(balance, ledger.decimals),
          symbol: ledger.metadata().symbol,
        };
      },
      allowance: (owner, spender) => {
        const ownerAddress = this.resolve(owner);
        const spenderAddress = this.resolve(spender);
        const value = ledger.allowance(ownerAddress, spenderAddress);
        return {
          owner: ownerAddress,
          spender: spenderAddress,
          allowance: value.toString(),
          allowanceFormatted: formatUnits(value, ledger.decimals),
        };
      },
      holders: () => ledger.holders(),
    };

    const view = views[method];
    if (!view) throw new TypeError(`unknown view method "${method}"`);
    return this.#runtime.call(() => view(...args));
  }

  /** `eth_sendTransaction` equivalent: mines a block, returns a receipt. */
  write(method, from, args = []) {
    const ledger = this.#ledger;
    const sender = this.resolve(from);

    const methods = {
      mint: (to, amount) => ledger.mint(sender, this.resolve(to), amount),
      transfer: (to, amount) => ledger.transfer(sender, this.resolve(to), amount),
      burn: (amount) => ledger.burn(sender, amount),
      approve: (spender, amount) => ledger.approve(sender, this.resolve(spender), amount),
      transferFrom: (owner, to, amount) =>
        ledger.transferFrom(sender, this.resolve(owner), this.resolve(to), amount),
    };

    const fn = methods[method];
    if (!fn) throw new TypeError(`unknown contract method "${method}"`);

    const { receipt, result } = fn(...args);
    return { receipt: this.#decorate(receipt), result };
  }

  transactions(options) {
    return this.#runtime
      .getTransactions(options)
      .map((receipt) => this.#decorate(receipt));
  }

  transaction(hash) {
    const receipt = this.#runtime.getReceipt(hash);
    return receipt ? this.#decorate(receipt) : null;
  }

  events(options) {
    return this.#runtime.getLogs(options).map((log) => ({
      ...log,
      args: this.#formatValues(log.args),
    }));
  }

  /** Wipe the chain and re-seed. Demo affordance — see `reset` in the API. */
  reset() {
    this.#bootstrap();
    return this.status();
  }

  #bootstrap() {
    this.#runtime = new ContractRuntime({ chainId: this.#config.chainId });

    const deployer = ContractRuntime.addressOf("treasury").toLowerCase();
    this.#ledger = new TokenLedger({
      runtime: this.#runtime,
      name: this.#config.name,
      symbol: this.#config.symbol,
      decimals: this.#config.decimals,
      owner: deployer,
    });

    this.#accounts = DEMO_ACCOUNTS.map(({ label, name }) => ({
      label,
      name,
      address: ContractRuntime.addressOf(label).toLowerCase(),
    }));

    // Genesis mint: the treasury starts funded so the demo has something to move.
    if (this.#config.genesisSupply && this.#config.genesisSupply !== "0") {
      this.#ledger.mint(deployer, deployer, this.#config.genesisSupply);
    }
  }

  /** Attach human-readable amounts and account labels for the UI. */
  #decorate(receipt) {
    return {
      ...receipt,
      fromLabel: this.#labelFor(receipt.from),
      logs: receipt.logs.map((log) => ({
        ...log,
        args: this.#formatValues(log.args),
      })),
    };
  }

  #formatValues(args) {
    const decimals = this.#ledger.decimals;
    return Object.fromEntries(
      Object.entries(args).map(([key, value]) => {
        if (key === "value") {
          return [key, { raw: value, formatted: formatUnits(value, decimals) }];
        }
        if (typeof value === "string" && ContractRuntime.isAddress(value)) {
          return [key, { address: value, label: this.#labelFor(value) }];
        }
        return [key, value];
      })
    );
  }

  #labelFor(address) {
    if (!address) return null;
    const match = this.#accounts.find(
      (account) => account.address === String(address).toLowerCase()
    );
    return match ? match.name : null;
  }
}

module.exports = { SimulatedContractAdapter, DEMO_ACCOUNTS };
