import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiActivity, FiAlertTriangle, FiRefreshCw } from 'react-icons/fi';
import ledgerApi, { shorten } from '../services/ledgerApi';
import AccountCard from '../components/ledger/AccountCard';
import ActionPanel from '../components/ledger/ActionPanel';
import TransactionList from '../components/ledger/TransactionList';

/**
 * Token ledger demo.
 *
 * Every figure on this page comes from the contract via the API — nothing is
 * held in component state except the last receipt, so what you see is always
 * the chain's view.
 */
function TokenLedger() {
  const [status, setStatus] = useState(null);
  const [token, setToken] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);

  const [selected, setSelected] = useState('treasury');
  const [receipt, setReceipt] = useState(null);
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const [health, meta, accountData, txData] = await Promise.all([
      ledgerApi.health(),
      ledgerApi.token(),
      ledgerApi.accounts(),
      ledgerApi.transactions({ limit: 15 }),
    ]);

    setStatus(health.status);
    setToken(meta.token);
    setAccounts(accountData.accounts);
    setTransactions(txData.transactions);
  }, []);

  useEffect(() => {
    refresh()
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [refresh]);

  const submit = async (method, values) => {
    setPending(true);
    setError(null);

    try {
      const response = await ledgerApi[method](values);
      // A revert is a real, mined transaction — surface the receipt either way.
      setReceipt(response.receipt);
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setPending(false);
    }
  };

  const reset = async () => {
    setPending(true);
    try {
      await ledgerApi.reset();
      setReceipt(null);
      setError(null);
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setPending(false);
    }
  };

  if (loading) {
    return (
      <div className="container py-24 text-center text-secondary-400">
        Connecting to the token ledger…
      </div>
    );
  }

  const symbol = token?.symbol ?? 'RVT';

  return (
    <div className="bg-secondary-50 min-h-screen py-10">
      <div className="container">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-secondary-900">Token Ledger</h1>
            <p className="text-secondary-500 mt-1 max-w-2xl">
              A live {symbol} ledger contract — mint, transfer and check balances.
              Runs entirely in-process, with the same call semantics, receipts and
              revert behaviour as an on-chain ERC-20.
            </p>
          </div>

          <button
            type="button"
            onClick={reset}
            disabled={pending}
            className="btn-secondary"
            title="Rewind the chain to genesis"
          >
            <FiRefreshCw className="mr-2" /> Reset chain
          </button>
        </div>

        {/* Chain status */}
        {status && token && (
          <div className="card p-4 mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Network">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-green-500" />
                {status.adapter} · chain {status.chainId}
              </span>
            </Stat>
            <Stat label="Block height">
              <span className="tabular-nums">{status.blockNumber}</span>
            </Stat>
            <Stat label="Total supply">
              <span className="tabular-nums">
                {Number(token.totalSupplyFormatted).toLocaleString()} {symbol}
              </span>
            </Stat>
            <Stat label="Contract">
              <span className="font-mono text-sm">{shorten(status.contract, 10, 6)}</span>
            </Stat>
          </div>
        )}

        {/* Errors — transport or validation, as opposed to a revert */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-6"
            >
              <div className="flex items-start gap-2 rounded-md bg-red-50 border border-red-200 p-4 text-sm text-red-700">
                <FiAlertTriangle className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Accounts */}
        <h2 className="text-lg font-semibold text-secondary-900 mb-3">Accounts</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-8">
          {accounts.map((account) => (
            <AccountCard
              key={account.label}
              account={account}
              symbol={symbol}
              isSelected={selected === account.label}
              onSelect={setSelected}
            />
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Compose */}
          <div>
            <h2 className="text-lg font-semibold text-secondary-900 mb-3">
              Send a transaction
            </h2>
            <ActionPanel
              accounts={accounts}
              onSubmit={submit}
              pending={pending}
              selectedAccount={selected}
            />

            <AnimatePresence>
              {receipt && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="mt-4"
                >
                  <div
                    className={`card p-4 border ${
                      receipt.status === 1
                        ? 'border-green-200 bg-green-50'
                        : 'border-red-200 bg-red-50'
                    }`}
                  >
                    <p className="text-sm font-semibold mb-2">
                      {receipt.status === 1
                        ? 'Transaction confirmed'
                        : `Transaction reverted — ${receipt.revertReason}`}
                    </p>
                    <pre className="text-xs overflow-x-auto text-secondary-600 font-mono">
                      {`hash    ${receipt.hash}
block   ${receipt.blockNumber}
gas     ${Number(receipt.gasUsed).toLocaleString()}
status  ${receipt.status === 1 ? '1 (success)' : '0 (reverted)'}
events  ${receipt.logs.map((log) => log.event).join(', ') || 'none'}`}
                    </pre>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* History */}
          <div>
            <h2 className="text-lg font-semibold text-secondary-900 mb-3 flex items-center gap-2">
              <FiActivity /> Transaction history
            </h2>
            <TransactionList transactions={transactions} symbol={symbol} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, children }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-secondary-400">
        {label}
      </p>
      <p className="mt-1 font-semibold text-secondary-900">{children}</p>
    </div>
  );
}

export default TokenLedger;
