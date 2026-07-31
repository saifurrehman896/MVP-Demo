import axios from 'axios';

/**
 * Client for the RentVerse token ledger API.
 *
 * The dev React server runs on :3000 and the Express API on :3099, so the base
 * URL is explicit rather than relative. Override with REACT_APP_LEDGER_API when
 * pointing at a deployed backend.
 *
 * 127.0.0.1 rather than `localhost` on purpose: `app.listen(PORT)` binds IPv4
 * only, so a client that resolves `localhost` to ::1 first has to fail over.
 */
const BASE_URL =
  process.env.REACT_APP_LEDGER_API || 'http://127.0.0.1:3099/api/ledger';

const client = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 10000,
});

/**
 * A reverted transaction is a successful HTTP response carrying `success:false`
 * and a receipt — not an exception. Only transport and validation failures throw.
 */
function toError(error) {
  if (error.response?.data?.error) return new Error(error.response.data.error);
  if (error.code === 'ECONNABORTED') return new Error('Ledger API timed out');
  if (!error.response) {
    return new Error(
      `Cannot reach the ledger API at ${BASE_URL}. Is the server running?`
    );
  }
  return new Error(error.message);
}

const get = async (path, config) => {
  try {
    const { data } = await client.get(path, config);
    return data;
  } catch (error) {
    throw toError(error);
  }
};

const post = async (path, body) => {
  try {
    const { data } = await client.post(path, body);
    return data;
  } catch (error) {
    throw toError(error);
  }
};

export const ledgerApi = {
  health: () => get('/health'),
  token: () => get('/token'),
  accounts: () => get('/accounts'),
  balance: (address) => get(`/balance/${address}`),
  allowance: (owner, spender) => get(`/allowance/${owner}/${spender}`),
  transactions: (params) => get('/transactions', { params }),
  events: (params) => get('/events', { params }),

  mint: (payload) => post('/mint', payload),
  transfer: (payload) => post('/transfer', payload),
  burn: (payload) => post('/burn', payload),
  approve: (payload) => post('/approve', payload),
  transferFrom: (payload) => post('/transfer-from', payload),
  reset: () => post('/reset', {}),
};

/** 0x1234…abcd — receipts and addresses are too long to render raw. */
export const shorten = (value, lead = 6, tail = 4) =>
  !value || value.length <= lead + tail ? value : `${value.slice(0, lead)}…${value.slice(-tail)}`;

export default ledgerApi;
