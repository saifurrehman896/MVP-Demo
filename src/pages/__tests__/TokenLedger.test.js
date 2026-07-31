/**
 * Renders the token ledger page against the real contract.
 *
 * Only the HTTP transport is stubbed — the stub is backed by the actual
 * `SimulatedContractAdapter`, so these assertions exercise genuine contract
 * behaviour (balances, receipts, reverts) rather than hand-written fixtures.
 */

import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import TokenLedger from '../TokenLedger';

const {
  SimulatedContractAdapter,
} = require('../../../server/contracts/ContractAdapter');

// Must be `mock`-prefixed: jest hoists the mock factory above this declaration
// and only allows out-of-scope references that follow that convention.
let mockAdapter;

// Stands in for the network, with the same request/response shapes the Express
// layer produces.
jest.mock('../../services/ledgerApi', () => {
  const send = (method, from, args) => {
    const { receipt, result } = mockAdapter.write(method, from, args);
    return Promise.resolve({
      success: receipt.status === 1,
      method,
      result,
      receipt,
      error: receipt.revertReason,
    });
  };

  return {
    __esModule: true,
    ...jest.requireActual('../../services/ledgerApi'),
    default: {
      health: () => Promise.resolve({ status: mockAdapter.status() }),
      token: () => Promise.resolve({ token: mockAdapter.read('metadata') }),
      accounts: () => Promise.resolve({ accounts: mockAdapter.accounts() }),
      transactions: (params) =>
        Promise.resolve({ transactions: mockAdapter.transactions(params || {}) }),
      mint: ({ to, amount, from = 'treasury' }) => send('mint', from, [to, amount]),
      transfer: ({ from, to, amount }) => send('transfer', from, [to, amount]),
      burn: ({ from, amount }) => send('burn', from, [amount]),
      approve: ({ owner, spender, amount }) => send('approve', owner, [spender, amount]),
      transferFrom: ({ spender, from, to, amount }) =>
        send('transferFrom', spender, [from, to, amount]),
      reset: () => Promise.resolve({ status: mockAdapter.reset() }),
    },
  };
});

beforeEach(() => {
  mockAdapter = new SimulatedContractAdapter({ genesisSupply: '1000000' });
});

/** Account names also appear as <option>s, so scope card lookups to the button. */
const card = (name) => screen.getByRole('button', { name: new RegExp(name) });

test('renders chain status and the genesis treasury balance', async () => {
  render(<TokenLedger />);

  expect(screen.getByText(/connecting to the token ledger/i)).toBeInTheDocument();

  await waitFor(() => expect(card('RentVerse Treasury')).toBeInTheDocument());

  // Genesis supply is both the treasury's balance and the chain's total supply.
  expect(within(card('RentVerse Treasury')).getByText('1,000,000')).toBeInTheDocument();
  expect(screen.getByText('Block height')).toBeInTheDocument();
  expect(screen.getByText(/1,000,000 RVT/)).toBeInTheDocument();
});

test('minting updates the recipient balance and shows a confirmed receipt', async () => {
  render(<TokenLedger />);
  await waitFor(() => expect(card('Alice')).toBeInTheDocument());

  fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '4200' } });
  fireEvent.click(screen.getByRole('button', { name: /send mint transaction/i }));

  await waitFor(() =>
    expect(screen.getByText(/transaction confirmed/i)).toBeInTheDocument()
  );
  expect(within(card('Alice')).getByText('4,200')).toBeInTheDocument();
  expect(mockAdapter.read('balanceOf', ['alice']).balanceFormatted).toBe('4200');
});

test('an overdrawn transfer surfaces the revert reason and leaves balances intact', async () => {
  render(<TokenLedger />);
  await waitFor(() => expect(card('Alice')).toBeInTheDocument());

  fireEvent.click(screen.getByRole('button', { name: 'Transfer' }));

  // AnimatePresence swaps the form out and in, so the new fields land a tick later.
  const fromField = await screen.findByLabelText('From');
  fireEvent.change(fromField, { target: { value: 'alice' } });
  fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '999999' } });
  fireEvent.click(screen.getByRole('button', { name: /send transfer transaction/i }));

  await waitFor(() =>
    expect(
      screen.getByText(/transaction reverted — transfer amount exceeds balance/i)
    ).toBeInTheDocument()
  );
  // Alice never held anything, and the revert must not have moved the treasury.
  expect(mockAdapter.read('balanceOf', ['alice']).balanceFormatted).toBe('0');
  expect(mockAdapter.read('metadata').totalSupplyFormatted).toBe('1000000');
});
