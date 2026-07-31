/**
 * TokenLedger — an ERC-20-shaped token contract, executed in-process.
 *
 * Mirrors `contracts/TokenLedger.sol` method-for-method and event-for-event.
 * Balances are BigInt base units (uint256), transfers are checked, and every
 * failure path reverts with the same reason string the Solidity version uses.
 * Nothing here touches a node, a wallet, or a chain library.
 */

const { ContractRuntime, require_ } = require("./ContractRuntime");
const { parseUnits, formatUnits, MAX_UINT256 } = require("./units");

const ZERO_ADDRESS = `0x${"0".repeat(40)}`;

class TokenLedger {
  #runtime;
  #address;
  #name;
  #symbol;
  #decimals;
  #owner;
  #totalSupply = 0n;
  #balances = new Map();
  #allowances = new Map();
  #minters = new Set();

  constructor({
    runtime,
    name = "RentVerse Token",
    symbol = "RVT",
    decimals = 18,
    owner,
    address,
  }) {
    this.#runtime = runtime;
    this.#name = name;
    this.#symbol = symbol;
    this.#decimals = decimals;
    this.#address = address ?? ContractRuntime.addressOf(`contract:${symbol}`);
    this.#owner = owner;
    this.#minters.add(owner);
  }

  // ── Views ────────────────────────────────────────────────────────────────
  // Read-only, free, and safe to call at any time — same as `view` in Solidity.

  get address() {
    return this.#address;
  }

  get decimals() {
    return this.#decimals;
  }

  metadata() {
    return {
      address: this.#address,
      name: this.#name,
      symbol: this.#symbol,
      decimals: this.#decimals,
      owner: this.#owner,
      totalSupply: this.#totalSupply.toString(),
      totalSupplyFormatted: formatUnits(this.#totalSupply, this.#decimals),
      minters: [...this.#minters],
    };
  }

  totalSupply() {
    return this.#totalSupply;
  }

  balanceOf(account) {
    const address = this.#normalize(account);
    return this.#balances.get(address) ?? 0n;
  }

  allowance(owner, spender) {
    const key = this.#normalize(owner);
    return this.#allowances.get(key)?.get(this.#normalize(spender)) ?? 0n;
  }

  /** Every account that has ever held a balance, richest first. */
  holders() {
    return [...this.#balances.entries()]
      .map(([address, balance]) => ({
        address,
        balance: balance.toString(),
        balanceFormatted: formatUnits(balance, this.#decimals),
      }))
      .sort((a, b) => {
        const left = BigInt(a.balance);
        const right = BigInt(b.balance);
        if (left === right) return 0;
        return right > left ? 1 : -1;
      });
  }

  // ── Transactions ─────────────────────────────────────────────────────────
  // Each mines a block and returns a receipt, success or revert.

  mint(from, to, amount) {
    return this.#send(from, "mint", [to, amount], (ctx) => {
      require_(this.#minters.has(ctx.sender), "caller is not a minter");

      const recipient = this.#requireAddress(to, "mint to the zero address");
      const value = this.#requireAmount(amount);
      require_(
        this.#totalSupply + value <= MAX_UINT256,
        "mint would overflow total supply"
      );

      this.#totalSupply += value;
      this.#credit(recipient, value);
      ctx.touch(2);

      ctx.emit("Transfer", {
        from: ZERO_ADDRESS,
        to: recipient,
        value: value.toString(),
      });
      ctx.emit("Mint", {
        minter: ctx.sender,
        to: recipient,
        value: value.toString(),
      });
      return { to: recipient, value: value.toString() };
    });
  }

  transfer(from, to, amount) {
    return this.#send(from, "transfer", [to, amount], (ctx) => {
      const recipient = this.#requireAddress(to, "transfer to the zero address");
      const value = this.#requireAmount(amount);

      this.#debit(ctx.sender, value, "transfer amount exceeds balance");
      this.#credit(recipient, value);
      ctx.touch(2);

      ctx.emit("Transfer", {
        from: ctx.sender,
        to: recipient,
        value: value.toString(),
      });
      return { from: ctx.sender, to: recipient, value: value.toString() };
    });
  }

  approve(from, spender, amount) {
    return this.#send(from, "approve", [spender, amount], (ctx) => {
      const delegate = this.#requireAddress(spender, "approve to the zero address");
      const value = this.#requireAmount(amount, { allowZero: true });

      if (!this.#allowances.has(ctx.sender)) this.#allowances.set(ctx.sender, new Map());
      this.#allowances.get(ctx.sender).set(delegate, value);
      ctx.touch(1);

      ctx.emit("Approval", {
        owner: ctx.sender,
        spender: delegate,
        value: value.toString(),
      });
      return { owner: ctx.sender, spender: delegate, value: value.toString() };
    });
  }

  /** Spend someone else's balance against an allowance — the escrow pattern. */
  transferFrom(spender, from, to, amount) {
    return this.#send(spender, "transferFrom", [from, to, amount], (ctx) => {
      const source = this.#requireAddress(from, "transfer from the zero address");
      const recipient = this.#requireAddress(to, "transfer to the zero address");
      const value = this.#requireAmount(amount);

      const approved = this.allowance(source, ctx.sender);
      require_(approved >= value, "insufficient allowance");

      this.#debit(source, value, "transfer amount exceeds balance");
      this.#credit(recipient, value);
      this.#allowances.get(source).set(ctx.sender, approved - value);
      ctx.touch(3);

      ctx.emit("Transfer", {
        from: source,
        to: recipient,
        value: value.toString(),
      });
      return { from: source, to: recipient, value: value.toString() };
    });
  }

  burn(from, amount) {
    return this.#send(from, "burn", [amount], (ctx) => {
      const value = this.#requireAmount(amount);

      this.#debit(ctx.sender, value, "burn amount exceeds balance");
      this.#totalSupply -= value;
      ctx.touch(2);

      ctx.emit("Transfer", {
        from: ctx.sender,
        to: ZERO_ADDRESS,
        value: value.toString(),
      });
      ctx.emit("Burn", { from: ctx.sender, value: value.toString() });
      return { from: ctx.sender, value: value.toString() };
    });
  }

  // ── Internals ────────────────────────────────────────────────────────────

  #send(from, method, args, executor) {
    return this.#runtime.sendTransaction(
      { to: this.#address, from: this.#normalize(from), method, args },
      executor,
      {
        capture: () => this.#capture(),
        restore: (snapshot) => this.#restore(snapshot),
      }
    );
  }

  #credit(address, value) {
    this.#balances.set(address, (this.#balances.get(address) ?? 0n) + value);
  }

  #debit(address, value, reason) {
    const balance = this.#balances.get(address) ?? 0n;
    require_(balance >= value, reason);
    this.#balances.set(address, balance - value);
  }

  #normalize(account) {
    if (!ContractRuntime.isAddress(account)) {
      throw new TypeError(`invalid address "${account}"`);
    }
    return account.toLowerCase();
  }

  #requireAddress(account, reason) {
    const address = this.#normalize(account);
    require_(address !== ZERO_ADDRESS, reason);
    return address;
  }

  #requireAmount(amount, { allowZero = false } = {}) {
    const value = parseUnits(amount, this.#decimals);
    if (!allowZero) require_(value > 0n, "amount must be greater than zero");
    return value;
  }

  /** Shallow-copy every mutable slot so a revert can restore it wholesale. */
  #capture() {
    return {
      totalSupply: this.#totalSupply,
      balances: new Map(this.#balances),
      allowances: new Map(
        [...this.#allowances].map(([owner, inner]) => [owner, new Map(inner)])
      ),
      minters: new Set(this.#minters),
    };
  }

  #restore(snapshot) {
    this.#totalSupply = snapshot.totalSupply;
    this.#balances = snapshot.balances;
    this.#allowances = snapshot.allowances;
    this.#minters = snapshot.minters;
  }
}

module.exports = { TokenLedger, ZERO_ADDRESS };
