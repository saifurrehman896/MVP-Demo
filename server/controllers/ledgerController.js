const asyncErrorHandler = require("../middlewares/helpers/asyncErrorHandler");
const ErrorHandler = require("../utils/errorHandler");
const { getAdapter } = require("../contracts");

/**
 * Token ledger API.
 *
 * Two distinct failure modes, deliberately kept apart:
 *   - Malformed input (bad address, non-numeric amount) throws a TypeError and
 *     comes back as HTTP 400 — the transaction never reaches the contract.
 *   - A broken contract rule (insufficient balance, not a minter) is a *revert*.
 *     That is a real transaction with a real receipt, so it returns HTTP 200
 *     with `success: false` and the receipt attached, exactly as a failed
 *     on-chain transaction would surface to a dApp.
 */

/** Run adapter work, translating input errors into 400s. */
const guard = (next, fn) => {
  try {
    return { ok: true, value: fn() };
  } catch (error) {
    if (error instanceof TypeError) {
      next(new ErrorHandler(error.message, 400));
      return { ok: false };
    }
    throw error;
  }
};

/** Shared shape for every write endpoint. */
const sendTransaction = (res, next, method, from, args) => {
  const outcome = guard(next, () => getAdapter().write(method, from, args));
  if (!outcome.ok) return;

  const { receipt, result } = outcome.value;
  const reverted = receipt.status === 0;

  res.status(reverted ? 200 : 201).json({
    success: !reverted,
    method,
    ...(reverted ? { error: receipt.revertReason } : { result }),
    receipt,
  });
};

// GET /api/ledger/health — adapter + chain status
exports.getHealth = asyncErrorHandler(async (req, res) => {
  res.status(200).json({ success: true, status: getAdapter().status() });
});

// GET /api/ledger/token — name, symbol, decimals, supply
exports.getToken = asyncErrorHandler(async (req, res) => {
  res.status(200).json({ success: true, token: getAdapter().read("metadata") });
});

// GET /api/ledger/accounts — demo accounts with live balances
exports.getAccounts = asyncErrorHandler(async (req, res) => {
  const adapter = getAdapter();
  res.status(200).json({
    success: true,
    accounts: adapter.accounts(),
    holders: adapter.read("holders"),
  });
});

// GET /api/ledger/balance/:address — balanceOf, accepts a label or a 0x address
exports.getBalance = asyncErrorHandler(async (req, res, next) => {
  const outcome = guard(next, () =>
    getAdapter().read("balanceOf", [req.params.address])
  );
  if (!outcome.ok) return;

  res.status(200).json({ success: true, ...outcome.value });
});

// GET /api/ledger/allowance/:owner/:spender
exports.getAllowance = asyncErrorHandler(async (req, res, next) => {
  const { owner, spender } = req.params;
  const outcome = guard(next, () => getAdapter().read("allowance", [owner, spender]));
  if (!outcome.ok) return;

  res.status(200).json({ success: true, ...outcome.value });
});

// POST /api/ledger/mint — { to, amount, from? }
exports.mint = asyncErrorHandler(async (req, res, next) => {
  const { to, amount, from = "treasury" } = req.body;

  if (!to || amount === undefined) {
    return next(new ErrorHandler("`to` and `amount` are required", 400));
  }
  sendTransaction(res, next, "mint", from, [to, amount]);
});

// POST /api/ledger/transfer — { from, to, amount }
exports.transfer = asyncErrorHandler(async (req, res, next) => {
  const { from, to, amount } = req.body;

  if (!from || !to || amount === undefined) {
    return next(new ErrorHandler("`from`, `to` and `amount` are required", 400));
  }
  sendTransaction(res, next, "transfer", from, [to, amount]);
});

// POST /api/ledger/burn — { from, amount }
exports.burn = asyncErrorHandler(async (req, res, next) => {
  const { from, amount } = req.body;

  if (!from || amount === undefined) {
    return next(new ErrorHandler("`from` and `amount` are required", 400));
  }
  sendTransaction(res, next, "burn", from, [amount]);
});

// POST /api/ledger/approve — { owner, spender, amount }
exports.approve = asyncErrorHandler(async (req, res, next) => {
  const { owner, spender, amount } = req.body;

  if (!owner || !spender || amount === undefined) {
    return next(new ErrorHandler("`owner`, `spender` and `amount` are required", 400));
  }
  sendTransaction(res, next, "approve", owner, [spender, amount]);
});

// POST /api/ledger/transfer-from — { spender, from, to, amount }
exports.transferFrom = asyncErrorHandler(async (req, res, next) => {
  const { spender, from, to, amount } = req.body;

  if (!spender || !from || !to || amount === undefined) {
    return next(
      new ErrorHandler("`spender`, `from`, `to` and `amount` are required", 400)
    );
  }
  sendTransaction(res, next, "transferFrom", spender, [from, to, amount]);
});

// GET /api/ledger/transactions?limit=&address=
exports.getTransactions = asyncErrorHandler(async (req, res, next) => {
  const { limit, address } = req.query;

  const outcome = guard(next, () => {
    const adapter = getAdapter();
    return adapter.transactions({
      limit: limit ? Number(limit) : undefined,
      address: address ? adapter.resolve(address) : undefined,
    });
  });
  if (!outcome.ok) return;

  res.status(200).json({
    success: true,
    count: outcome.value.length,
    transactions: outcome.value,
  });
});

// GET /api/ledger/transactions/:hash
exports.getTransaction = asyncErrorHandler(async (req, res, next) => {
  const receipt = getAdapter().transaction(req.params.hash);

  if (!receipt) {
    return next(new ErrorHandler("Transaction Not Found", 404));
  }
  res.status(200).json({ success: true, transaction: receipt });
});

// GET /api/ledger/events?event=Transfer&limit=
exports.getEvents = asyncErrorHandler(async (req, res) => {
  const { event, limit } = req.query;
  const events = getAdapter().events({
    event,
    limit: limit ? Number(limit) : undefined,
  });

  res.status(200).json({ success: true, count: events.length, events });
});

// POST /api/ledger/reset — rewind to genesis (demo only)
exports.reset = asyncErrorHandler(async (req, res) => {
  res.status(200).json({ success: true, status: getAdapter().reset() });
});
