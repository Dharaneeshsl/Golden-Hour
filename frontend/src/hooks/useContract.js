import { ethers } from "ethers";

const addresses = {
  registry: import.meta.env.VITE_REGISTRY_ADDRESS,
  accessControl: import.meta.env.VITE_ACCESS_CONTROL_ADDRESS,
  records: import.meta.env.VITE_RECORDS_ADDRESS,
  emergency: import.meta.env.VITE_EMERGENCY_ADDRESS,
};

export function useContract() {
  const connect = async () => {
    if (!window.ethereum) throw new Error("MetaMask or a compatible wallet is required");
    const provider = new ethers.BrowserProvider(window.ethereum);
    await provider.send("eth_requestAccounts", []);
    const signer = await provider.getSigner();
    return { provider, signer, address: await signer.getAddress() };
  };

  const getRegistry = async () => {
    const { signer } = await connect();
    if (!addresses.registry) throw new Error("VITE_REGISTRY_ADDRESS is not configured");
    const registryAbi = ["function getPatientId(address) view returns (uint256)"];
    return new ethers.Contract(addresses.registry, registryAbi, signer);
  };

  return { addresses, connect, getRegistry, configured: Boolean(addresses.registry) };
}
