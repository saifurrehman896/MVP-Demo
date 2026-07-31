/**
 * Standalone dev server for the token ledger API.
 *
 * Why this exists: importing the legacy route tree (`server/app.js` →
 * order/payment/product/user routes) freezes the Node event loop a couple of
 * seconds after boot — timers stop firing and the process stops answering,
 * without burning CPU. That is a pre-existing fault unrelated to the ledger;
 * mounting only this router runs indefinitely.
 *
 * `npm start` still boots the full app. Use this when you want the ledger API
 * on its own — demos, recording, or working on the contract layer.
 */

const express = require("express");
const ledgerRouter = require("./routes/ledgerRoute");

const app = express();
const PORT = process.env.LEDGER_PORT || 3099;

app.use(express.json());
app.use("/api/ledger", ledgerRouter);

app.get("/", (req, res) => {
  res.json({
    service: "RentVerse token ledger",
    base: "/api/ledger",
    docs: "server/contracts/README.md",
  });
});

app.listen(PORT, () => {
  console.log(`Token ledger API → http://127.0.0.1:${PORT}/api/ledger`);
});
