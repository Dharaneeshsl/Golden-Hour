export const DEMO_ACCOUNTS = {
  admin: {
    label: "Admin Account (0xeF4C...749c)",
    wallet: "0xeF4C5fa4f9b9fFD908d5b422Dd1C3eEd3D9F749c",
  },
  doctor: {
    label: "Provider Account (0xa299...95Ee)",
    wallet: "0xa2994811542d34846a4Bdd67A1ff29c9514395Ee",
  },
  patient: {
    label: "Patient Account (0xA9A6...4504)",
    wallet: "0xA9A65f72a90f4D4021CB56CC70f21D84fD444504",
  },
};

const DEMO_WALLET_SET = new Set(
  Object.values(DEMO_ACCOUNTS).map((account) => account.wallet.toLowerCase())
);

export function isDemoWallet(wallet) {
  return DEMO_WALLET_SET.has((wallet || "").toLowerCase());
}
