import { PairingManager } from "../bridge/pairing.js";

export async function pairCommand(): Promise<void> {
  const pairingManager = new PairingManager();
  const secret = pairingManager.initiatePairing();
  console.log("Pairing initiated.");
  console.log("Secret:", secret);
  console.log("Please confirm this secret in the browser extension popup.");
}
