import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiArrowRight, FiLoader } from 'react-icons/fi';

/**
 * Transaction composer. Each tab maps one-to-one onto a contract method, so
 * what the form submits is literally the method's argument list.
 */
const ACTIONS = [
  {
    id: 'mint',
    label: 'Mint',
    hint: 'Create new tokens. Only the treasury holds the minter role.',
    fields: [
      { name: 'from', label: 'Minter', type: 'account', default: 'treasury' },
      { name: 'to', label: 'Recipient', type: 'account', default: 'alice' },
      { name: 'amount', label: 'Amount', type: 'amount', default: '1000' },
    ],
  },
  {
    id: 'transfer',
    label: 'Transfer',
    hint: 'Move tokens between accounts. Reverts if the balance is short.',
    fields: [
      { name: 'from', label: 'From', type: 'account', default: 'treasury' },
      { name: 'to', label: 'To', type: 'account', default: 'bob' },
      { name: 'amount', label: 'Amount', type: 'amount', default: '250' },
    ],
  },
  {
    id: 'approve',
    label: 'Approve',
    hint: 'Let a spender move tokens on the owner’s behalf — the escrow pattern.',
    fields: [
      { name: 'owner', label: 'Owner', type: 'account', default: 'alice' },
      { name: 'spender', label: 'Spender', type: 'account', default: 'bob' },
      { name: 'amount', label: 'Allowance', type: 'amount', default: '500' },
    ],
  },
  {
    id: 'transferFrom',
    label: 'Transfer From',
    hint: 'Spend an existing allowance. Reverts if it is not large enough.',
    fields: [
      { name: 'spender', label: 'Spender', type: 'account', default: 'bob' },
      { name: 'from', label: 'Owner', type: 'account', default: 'alice' },
      { name: 'to', label: 'Recipient', type: 'account', default: 'carol' },
      { name: 'amount', label: 'Amount', type: 'amount', default: '100' },
    ],
  },
  {
    id: 'burn',
    label: 'Burn',
    hint: 'Destroy tokens and reduce total supply.',
    fields: [
      { name: 'from', label: 'From', type: 'account', default: 'alice' },
      { name: 'amount', label: 'Amount', type: 'amount', default: '50' },
    ],
  },
];

const initialValues = (action) =>
  Object.fromEntries(action.fields.map((field) => [field.name, field.default]));

function ActionPanel({ accounts, onSubmit, pending, selectedAccount }) {
  const [activeId, setActiveId] = useState('mint');
  const [values, setValues] = useState(() => initialValues(ACTIONS[0]));

  const action = ACTIONS.find((item) => item.id === activeId);

  const selectAction = (next) => {
    setActiveId(next.id);
    const defaults = initialValues(next);
    // Carry the account picked in the grid into whichever field is the sender.
    const senderField = next.fields.find((field) =>
      ['from', 'owner', 'spender'].includes(field.name)
    );
    if (senderField && selectedAccount) defaults[senderField.name] = selectedAccount;
    setValues(defaults);
  };

  const update = (name, value) => setValues((prev) => ({ ...prev, [name]: value }));

  const submit = (event) => {
    event.preventDefault();
    onSubmit(action.id, values);
  };

  return (
    <div className="card p-5">
      <div className="flex flex-wrap gap-2 mb-4">
        {ACTIONS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => selectAction(item)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              item.id === activeId
                ? 'bg-primary-600 text-white'
                : 'bg-secondary-100 text-secondary-600 hover:bg-secondary-200'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.form
          key={action.id}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.15 }}
          onSubmit={submit}
        >
          <p className="text-sm text-secondary-500 mb-4">{action.hint}</p>

          <div className="grid gap-3 sm:grid-cols-2">
            {action.fields.map((field) => (
              <div key={field.name}>
                <label
                  htmlFor={`${action.id}-${field.name}`}
                  className="block text-xs font-medium text-secondary-600 mb-1"
                >
                  {field.label}
                </label>

                {field.type === 'account' ? (
                  <select
                    id={`${action.id}-${field.name}`}
                    className="input"
                    value={values[field.name]}
                    onChange={(event) => update(field.name, event.target.value)}
                  >
                    {accounts.map((account) => (
                      <option key={account.label} value={account.label}>
                        {account.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    id={`${action.id}-${field.name}`}
                    className="input"
                    inputMode="decimal"
                    placeholder="0.0"
                    value={values[field.name]}
                    onChange={(event) => update(field.name, event.target.value)}
                  />
                )}
              </div>
            ))}
          </div>

          <button type="submit" className="btn mt-4 w-full justify-center" disabled={pending}>
            {pending ? (
              <>
                <FiLoader className="animate-spin mr-2" /> Submitting…
              </>
            ) : (
              <>
                Send {action.label} transaction <FiArrowRight className="ml-2" />
              </>
            )}
          </button>
        </motion.form>
      </AnimatePresence>
    </div>
  );
}

export default ActionPanel;
