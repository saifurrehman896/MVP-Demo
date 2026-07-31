/**
 * Contract + adapter tests. Run with `npm run test:contracts`.
 * Uses node:test — no test framework dependency added to the project.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const { SimulatedContractAdapter } = require("../ContractAdapter");
const { ContractRuntime } = require("../ContractRuntime");
const { parseUnits, formatUnits } = require("../units");

/** Fresh chain per test, with no genesis mint unless a test asks for one. */
const fresh = (config = {}) =>
  new SimulatedContractAdapter({ genesisSupply: "0", ...config });

const balance = (adapter, who) => adapter.read("balanceOf", [who]).balanceFormatted;

// ── units ─────────────────────────────────────────────────────────────────

test("parseUnits and formatUnits round-trip without float drift", () => {
  assert.equal(parseUnits("100.5", 18), 100500000000000000000n);
  assert.equal(parseUnits("0.000000000000000001", 18), 1n);
  assert.equal(formatUnits(100500000000000000000n, 18), "100.5");
  assert.equal(formatUnits(1n, 18), "0.000000000000000001");

  // The classic float trap: 0.1 + 0.2 !== 0.3 in IEEE-754, but must hold here.
  const sum = parseUnits("0.1", 18) + parseUnits("0.2", 18);
  assert.equal(formatUnits(sum, 18), "0.3");
});

test("parseUnits rejects malformed and over-precise amounts", () => {
  assert.throws(() => parseUnits("abc", 18), TypeError);
  assert.throws(() => parseUnits("-5", 18), TypeError);
  assert.throws(() => parseUnits("1.0000000000000000001", 18), TypeError);
});

// ── minting ───────────────────────────────────────────────────────────────

test("mint credits the recipient and raises total supply", () => {
  const adapter = fresh();
  const { receipt } = adapter.write("mint", "treasury", ["alice", "500"]);

  assert.equal(receipt.status, 1);
  assert.equal(balance(adapter, "alice"), "500");
  assert.equal(adapter.read("metadata").totalSupplyFormatted, "500");
});

test("mint emits Transfer from the zero address plus Mint", () => {
  const adapter = fresh();
  const { receipt } = adapter.write("mint", "treasury", ["alice", "500"]);

  assert.deepEqual(
    receipt.logs.map((log) => log.event),
    ["Transfer", "Mint"]
  );
  assert.equal(receipt.logs[0].args.from.address, `0x${"0".repeat(40)}`);
  assert.equal(receipt.logs[0].args.value.formatted, "500");
});

test("mint from a non-minter reverts and changes nothing", () => {
  const adapter = fresh();
  const { receipt } = adapter.write("mint", "alice", ["alice", "500"]);

  assert.equal(receipt.status, 0);
  assert.equal(receipt.revertReason, "caller is not a minter");
  assert.equal(balance(adapter, "alice"), "0");
  assert.equal(adapter.read("totalSupply"), "0");
});

// ── transferring ──────────────────────────────────────────────────────────

test("transfer moves the balance between accounts", () => {
  const adapter = fresh();
  adapter.write("mint", "treasury", ["alice", "1000"]);

  const { receipt } = adapter.write("transfer", "alice", ["bob", "250.75"]);

  assert.equal(receipt.status, 1);
  assert.equal(balance(adapter, "alice"), "749.25");
  assert.equal(balance(adapter, "bob"), "250.75");
});

test("transfer conserves total supply", () => {
  const adapter = fresh();
  adapter.write("mint", "treasury", ["alice", "1000"]);
  const before = adapter.read("totalSupply");

  adapter.write("transfer", "alice", ["bob", "400"]);

  assert.equal(adapter.read("totalSupply"), before);
});

test("overdrawn transfer reverts and rolls state back entirely", () => {
  const adapter = fresh();
  adapter.write("mint", "treasury", ["alice", "100"]);

  const { receipt } = adapter.write("transfer", "alice", ["bob", "500"]);

  assert.equal(receipt.status, 0);
  assert.equal(receipt.revertReason, "transfer amount exceeds balance");
  assert.equal(balance(adapter, "alice"), "100");
  assert.equal(balance(adapter, "bob"), "0");
  assert.equal(receipt.logs.length, 0, "a reverted tx must emit no events");
});

test("zero-amount transfer reverts", () => {
  const adapter = fresh();
  adapter.write("mint", "treasury", ["alice", "100"]);

  const { receipt } = adapter.write("transfer", "alice", ["bob", "0"]);

  assert.equal(receipt.status, 0);
  assert.equal(receipt.revertReason, "amount must be greater than zero");
});

// ── allowances ────────────────────────────────────────────────────────────

test("approve then transferFrom spends the allowance exactly once", () => {
  const adapter = fresh();
  adapter.write("mint", "treasury", ["alice", "1000"]);
  adapter.write("approve", "alice", ["bob", "300"]);

  assert.equal(adapter.read("allowance", ["alice", "bob"]).allowanceFormatted, "300");

  const { receipt } = adapter.write("transferFrom", "bob", ["alice", "carol", "120"]);

  assert.equal(receipt.status, 1);
  assert.equal(balance(adapter, "carol"), "120");
  assert.equal(adapter.read("allowance", ["alice", "bob"]).allowanceFormatted, "180");
});

test("transferFrom beyond the allowance reverts", () => {
  const adapter = fresh();
  adapter.write("mint", "treasury", ["alice", "1000"]);
  adapter.write("approve", "alice", ["bob", "100"]);

  const { receipt } = adapter.write("transferFrom", "bob", ["alice", "carol", "500"]);

  assert.equal(receipt.status, 0);
  assert.equal(receipt.revertReason, "insufficient allowance");
  assert.equal(balance(adapter, "alice"), "1000");
});

// ── burning ───────────────────────────────────────────────────────────────

test("burn destroys supply", () => {
  const adapter = fresh();
  adapter.write("mint", "treasury", ["alice", "1000"]);
  adapter.write("burn", "alice", ["400"]);

  assert.equal(balance(adapter, "alice"), "600");
  assert.equal(adapter.read("metadata").totalSupplyFormatted, "600");
});

// ── chain semantics ───────────────────────────────────────────────────────

test("each transaction mines exactly one block and gets a unique hash", () => {
  const adapter = fresh();
  const start = adapter.status().blockNumber;

  const a = adapter.write("mint", "treasury", ["alice", "10"]).receipt;
  const b = adapter.write("mint", "treasury", ["alice", "20"]).receipt;

  assert.equal(a.blockNumber, start + 1);
  assert.equal(b.blockNumber, start + 2);
  assert.notEqual(a.hash, b.hash);
  assert.match(a.hash, /^0x[0-9a-f]{64}$/);
});

test("reverted transactions are still mined and still cost gas", () => {
  const adapter = fresh();
  const { receipt } = adapter.write("transfer", "alice", ["bob", "1"]);

  assert.equal(receipt.status, 0);
  assert.ok(BigInt(receipt.gasUsed) > 0n);
  assert.equal(adapter.transaction(receipt.hash).hash, receipt.hash);
});

test("transaction history is newest-first and filterable by address", () => {
  const adapter = fresh();
  adapter.write("mint", "treasury", ["alice", "100"]);
  adapter.write("transfer", "alice", ["bob", "10"]);

  const all = adapter.transactions({});
  assert.equal(all.length, 2);
  assert.equal(all[0].method, "transfer");

  const bobs = adapter.transactions({ address: adapter.resolve("bob") });
  assert.equal(bobs.length, 1);
  assert.equal(bobs[0].method, "transfer");
});

test("event log is queryable by event name", () => {
  const adapter = fresh();
  adapter.write("mint", "treasury", ["alice", "100"]);
  adapter.write("transfer", "alice", ["bob", "10"]);

  assert.equal(adapter.events({ event: "Transfer" }).length, 2);
  assert.equal(adapter.events({ event: "Mint" }).length, 1);
});

// ── addressing ────────────────────────────────────────────────────────────

test("labels and raw addresses resolve to the same account", () => {
  const adapter = fresh();
  const address = adapter.resolve("alice");

  assert.ok(ContractRuntime.isAddress(address));
  assert.equal(adapter.resolve(address), address);
  assert.equal(adapter.resolve(address.toUpperCase().replace("0X", "0x")), address);
});

test("unknown labels and malformed addresses raise TypeError, not a revert", () => {
  const adapter = fresh();

  assert.throws(() => adapter.resolve("mallory"), TypeError);
  assert.throws(() => adapter.resolve("0x1234"), TypeError);
});

// ── invariants ────────────────────────────────────────────────────────────

test("sum of all balances always equals total supply", () => {
  const adapter = fresh();
  adapter.write("mint", "treasury", ["alice", "1000"]);
  adapter.write("mint", "treasury", ["bob", "500"]);
  adapter.write("transfer", "alice", ["carol", "300"]);
  adapter.write("transfer", "bob", ["alice", "50"]);
  adapter.write("burn", "carol", ["100"]);
  adapter.write("transfer", "carol", ["bob", "99999"]); // reverts

  const held = adapter
    .read("holders")
    .reduce((total, holder) => total + BigInt(holder.balance), 0n);

  assert.equal(held.toString(), adapter.read("totalSupply"));
});

test("reset rewinds the chain to genesis", () => {
  const adapter = fresh({ genesisSupply: "1000000" });
  adapter.write("transfer", "treasury", ["alice", "5000"]);
  assert.equal(balance(adapter, "alice"), "5000");

  adapter.reset();

  assert.equal(balance(adapter, "alice"), "0");
  assert.equal(adapter.read("metadata").totalSupplyFormatted, "1000000");
});
