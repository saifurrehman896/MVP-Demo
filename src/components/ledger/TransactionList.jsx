import { motion } from 'framer-motion';
import { FiAlertCircle, FiCheckCircle } from 'react-icons/fi';
import { shorten } from '../../services/ledgerApi';

/** `{ address, label }` from the API, or a plain string. */
const nameOf = (party) => {
  if (!party) return '—';
  if (typeof party === 'string') return shorten(party, 6, 4);
  if (party.address === `0x${'0'.repeat(40)}`) return 'ZERO ADDRESS';
  return party.label || shorten(party.address, 6, 4);
};

/** Pull the human-facing summary out of a receipt's event logs. */
function summarize(receipt) {
  const transfer = receipt.logs.find((log) => log.event === 'Transfer');
  if (!transfer) return null;

  return {
    from: nameOf(transfer.args.from),
    to: nameOf(transfer.args.to),
    value: transfer.args.value?.formatted,
  };
}

function TransactionList({ transactions, symbol }) {
  if (!transactions.length) {
    return (
      <div className="card p-8 text-center text-secondary-400 text-sm">
        No transactions yet — send one to mine the first block.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {transactions.map((receipt) => {
        const succeeded = receipt.status === 1;
        const summary = summarize(receipt);

        return (
          <motion.div
            key={receipt.hash}
            layout
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className={`card p-4 border-l-4 ${
              succeeded ? 'border-l-green-500' : 'border-l-red-500'
            }`}
          >
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                {succeeded ? (
                  <FiCheckCircle className="text-green-500 shrink-0" />
                ) : (
                  <FiAlertCircle className="text-red-500 shrink-0" />
                )}
                <span className="font-semibold text-secondary-900">{receipt.method}</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-secondary-100 text-secondary-600">
                  block {receipt.blockNumber}
                </span>
              </div>

              {summary && succeeded && (
                <p className="text-sm text-secondary-700 tabular-nums">
                  <span className="font-medium">{summary.from}</span>
                  <span className="mx-1.5 text-secondary-400">→</span>
                  <span className="font-medium">{summary.to}</span>
                  <span className="ml-2 font-semibold text-primary-700">
                    {summary.value} {symbol}
                  </span>
                </p>
              )}
            </div>

            {!succeeded && (
              <p className="mt-2 text-sm text-red-600">
                Reverted: {receipt.revertReason}
              </p>
            )}

            <dl className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 text-xs text-secondary-500">
              <div className="col-span-2 sm:col-span-1">
                <dt className="inline font-medium">Hash </dt>
                <dd className="inline font-mono">{shorten(receipt.hash, 10, 6)}</dd>
              </div>
              <div>
                <dt className="inline font-medium">Gas </dt>
                <dd className="inline tabular-nums">
                  {Number(receipt.gasUsed).toLocaleString()}
                </dd>
              </div>
              <div>
                <dt className="inline font-medium">Sender </dt>
                <dd className="inline">
                  {receipt.fromLabel || shorten(receipt.from, 6, 4)}
                </dd>
              </div>
            </dl>
          </motion.div>
        );
      })}
    </div>
  );
}

export default TransactionList;
