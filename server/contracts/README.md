# Token Ledger — contract layer & API

A working ERC-20-style token contract for RentVerse that runs **in-process, with
no blockchain dependency** — no node, no RPC endpoint, no wallet, no `ethers`
call at runtime. It reproduces the semantics an application actually depends on
(message sender, balances, allowances, receipts, gas, events, reverts) so the
rest of the platform can be built and demoed against real contract behaviour.

## Why this shape

The API never touches the contract directly. It goes through an **adapter** with
two methods:

```js
adapter.read(method, args)         // eth_call    — free, no receipt
adapter.write(method, from, args)  // eth_sendTx  — mines a block, returns a receipt
```

`SimulatedContractAdapter` implements that against the in-memory contract. To go
on-chain later, implement the same two methods over ethers/viem against the
deployed `contracts/TokenLedger.sol` and return it from `createAdapter()` in
[`index.js`](index.js). **No controller, route or React component changes.**

## Files

| File | Role |
| --- | --- |
| `units.js` | `parseUnits`/`formatUnits` over BigInt — token math never touches a float |
| `ContractRuntime.js` | Blocks, tx hashes, receipts, gas, event logs, revert + state rollback |
| `TokenLedger.js` | The contract: mint, transfer, approve, transferFrom, burn |
| `ContractAdapter.js` | The `read`/`write` seam + demo accounts and label resolution |
| `index.js` | Chooses the backend from `LEDGER_ADAPTER` |
| `../../contracts/TokenLedger.sol` | The Solidity spec this mirrors method-for-method |

## Design notes

**Amounts are BigInt base units.** 18 decimals, exactly like uint256 on-chain.
`0.1 + 0.2` is exactly `0.3` here; with JS numbers it would not be. Values cross
the API as decimal strings (`"1250.5"`) and are returned both raw and formatted.

**A revert is not an error.** Breaking a contract rule (insufficient balance, not
a minter) produces a real, mined transaction with `status: 0` and a reason — so
the API returns **HTTP 200 with `success: false` and the receipt attached**, the
same way a dApp sees a failed on-chain transaction. Only *malformed input* (bad
address, non-numeric amount) is a client error and returns **400**. Reverted
transactions roll contract state back completely and emit no events.

**Accounts have labels.** `treasury`, `alice`, `bob`, `carol` resolve to stable
addresses derived from their name, so the UI and curl can use readable names.
Raw `0x…` addresses work everywhere a label does.

## API

Base path `/api/ledger`. Every endpoint returns JSON.

### Reads

| Method | Path | Returns |
| --- | --- | --- |
| GET | `/health` | adapter kind, chain id, block height, contract address |
| GET | `/token` | name, symbol, decimals, total supply, minters |
| GET | `/accounts` | demo accounts with live balances, plus all holders |
| GET | `/balance/:address` | `balanceOf` — accepts a label or `0x…` |
| GET | `/allowance/:owner/:spender` | remaining allowance |
| GET | `/transactions?limit=&address=` | receipts, newest first |
| GET | `/transactions/:hash` | one receipt |
| GET | `/events?event=&limit=` | event log (`Transfer`, `Mint`, `Burn`, `Approval`) |

### Writes

| Method | Path | Body |
| --- | --- | --- |
| POST | `/mint` | `{ to, amount, from? }` — `from` defaults to `treasury` |
| POST | `/transfer` | `{ from, to, amount }` |
| POST | `/approve` | `{ owner, spender, amount }` |
| POST | `/transfer-from` | `{ spender, from, to, amount }` |
| POST | `/burn` | `{ from, amount }` |
| POST | `/reset` | none — rewinds the chain to genesis (demo only) |

### Example

```bash
curl -s http://127.0.0.1:3099/api/ledger/balance/treasury

curl -s -X POST http://127.0.0.1:3099/api/ledger/mint \
  -H 'Content-Type: application/json' \
  -d '{"to":"alice","amount":"5000"}'

curl -s -X POST http://127.0.0.1:3099/api/ledger/transfer \
  -H 'Content-Type: application/json' \
  -d '{"from":"alice","to":"bob","amount":"1250.5"}'
```

A successful write returns `201` with `success: true`, the decoded `result` and a
full `receipt` (hash, block, gas, event logs). A revert returns `200` with
`success: false`, an `error` reason and the receipt.

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `LEDGER_ADAPTER` | `simulated` | Contract backend |
| `LEDGER_TOKEN_NAME` | `RentVerse Token` | Token name |
| `LEDGER_TOKEN_SYMBOL` | `RVT` | Token symbol |
| `LEDGER_GENESIS_SUPPLY` | `1000000` | Minted to the treasury at boot; `0` to start empty |
| `REACT_APP_LEDGER_API` | `http://127.0.0.1:3099/api/ledger` | Frontend base URL |

## Tests

```bash
npm run test:contracts
```

20 tests covering unit conversion, mint/transfer/burn, allowance flows, revert
rollback, gas and block accounting, address resolution, and the invariant that
the sum of all balances always equals total supply.
