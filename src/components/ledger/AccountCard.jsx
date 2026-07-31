import { motion } from 'framer-motion';
import { FiCheck, FiCopy } from 'react-icons/fi';
import { useState } from 'react';
import { shorten } from '../../services/ledgerApi';

/**
 * One ledger account: label, address and live balance.
 * Selecting a card sets it as the sender for the next transaction.
 */
function AccountCard({ account, isSelected, onSelect, symbol }) {
  const [copied, setCopied] = useState(false);

  const copyAddress = async (event) => {
    event.stopPropagation();
    try {
      await navigator.clipboard.writeText(account.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard is unavailable outside a secure context — not worth surfacing.
    }
  };

  return (
    <motion.button
      type="button"
      layout
      onClick={() => onSelect(account.label)}
      className={`card w-full text-left p-4 border-2 transition-colors ${
        isSelected
          ? 'border-primary-600 ring-2 ring-primary-100'
          : 'border-transparent hover:border-primary-200'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-secondary-900 truncate">{account.name}</p>
          <p className="text-xs text-secondary-400 font-mono mt-0.5">
            {shorten(account.address, 10, 6)}
          </p>
        </div>
        <span
          onClick={copyAddress}
          title="Copy address"
          className="shrink-0 p-1.5 rounded hover:bg-secondary-100 text-secondary-400 hover:text-primary-600"
        >
          {copied ? <FiCheck size={14} /> : <FiCopy size={14} />}
        </span>
      </div>

      <div className="mt-4">
        <motion.p
          key={account.balanceFormatted}
          initial={{ opacity: 0.4, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-2xl font-bold text-secondary-900 tabular-nums break-all"
        >
          {Number(account.balanceFormatted).toLocaleString(undefined, {
            maximumFractionDigits: 6,
          })}
        </motion.p>
        <p className="text-xs font-medium text-secondary-500 mt-0.5">{symbol}</p>
      </div>
    </motion.button>
  );
}

export default AccountCard;
