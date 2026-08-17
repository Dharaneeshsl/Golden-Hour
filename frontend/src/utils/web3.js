export function shortenAddress(address = "") { return address ? `${address.slice(0, 6)}…${address.slice(-4)}` : ""; }
export function isWalletAddress(value = "") { return /^0x[a-fA-F0-9]{40}$/.test(value); }
