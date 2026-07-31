const express = require("express");
const cors = require("cors");
const {
  getHealth,
  getToken,
  getAccounts,
  getBalance,
  getAllowance,
  mint,
  transfer,
  burn,
  approve,
  transferFrom,
  getTransactions,
  getTransaction,
  getEvents,
  reset,
} = require("../controllers/ledgerController");

const router = express.Router();

// The CRA dev server runs on :3000 while the API runs on :3099, so this router
// opts into CORS. Scoped here rather than app-wide to leave existing routes as
// they are. Tighten `origin` before this goes anywhere but a demo.
router.use(cors({ origin: true, credentials: true }));

// Reads
router.route("/health").get(getHealth);
router.route("/token").get(getToken);
router.route("/accounts").get(getAccounts);
router.route("/balance/:address").get(getBalance);
router.route("/allowance/:owner/:spender").get(getAllowance);
router.route("/transactions").get(getTransactions);
router.route("/transactions/:hash").get(getTransaction);
router.route("/events").get(getEvents);

// Writes
router.route("/mint").post(mint);
router.route("/transfer").post(transfer);
router.route("/burn").post(burn);
router.route("/approve").post(approve);
router.route("/transfer-from").post(transferFrom);
router.route("/reset").post(reset);

// Unmatched path under /api/ledger
router.use((req, res) => {
  res.status(404).json({
    success: false,
    error: `No ledger route for ${req.method} ${req.originalUrl}`,
  });
});

// Router-scoped error handler. The app does not register a global JSON error
// middleware, and adding one would change how the existing routes behave, so
// the ledger API handles its own — every response from here stays JSON.
// eslint-disable-next-line no-unused-vars
router.use((err, req, res, next) => {
  const statusCode = err.statusCode || 500;

  if (statusCode >= 500) {
    console.error("[ledger]", err);
  }
  res.status(statusCode).json({
    success: false,
    error: statusCode >= 500 ? "Internal Server Error" : err.message,
  });
});

module.exports = router;
