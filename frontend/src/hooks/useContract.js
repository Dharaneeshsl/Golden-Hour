export function useContract() { return { configured: Boolean(import.meta.env.VITE_REGISTRY_ADDRESS) }; }
