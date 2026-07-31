/**
 * Fixed-point unit helpers.
 *
 * Token amounts are held as BigInt base units (like uint256 on-chain) so that
 * no arithmetic ever passes through a JS float. These helpers convert between
 * the human string form ("100.5") and base units (100500000000000000000n).
 *
 * Deliberately dependency-free — this is the same math ethers/web3 do, but we
 * do not want a blockchain library in the tree.
 */

const MAX_UINT256 = 2n ** 256n - 1n;

/**
 * "100.5" + 18 decimals -> 100500000000000000000n
 */
function parseUnits(value, decimals) {
  if (typeof value === "bigint") return value;
  if (value === null || value === undefined) {
    throw new TypeError("amount is required");
  }

  const raw = String(value).trim();
  if (!/^\d+(\.\d+)?$/.test(raw)) {
    throw new TypeError(`invalid amount "${value}" (expected a positive decimal)`);
  }

  const [whole, fraction = ""] = raw.split(".");
  if (fraction.length > decimals) {
    throw new TypeError(`amount "${value}" has more than ${decimals} decimal places`);
  }

  const padded = fraction.padEnd(decimals, "0");
  const result = BigInt(whole + padded);

  if (result > MAX_UINT256) {
    throw new TypeError(`amount "${value}" overflows uint256`);
  }
  return result;
}

/**
 * 100500000000000000000n + 18 decimals -> "100.5"
 */
function formatUnits(value, decimals) {
  const amount = BigInt(value);
  const negative = amount < 0n;
  const digits = (negative ? -amount : amount).toString().padStart(decimals + 1, "0");

  const whole = digits.slice(0, digits.length - decimals);
  const fraction = digits.slice(digits.length - decimals).replace(/0+$/, "");

  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

module.exports = { parseUnits, formatUnits, MAX_UINT256 };
