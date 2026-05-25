import { PairingManager } from "../bridge/pairing.js";
import { DATA_DIR } from "../runtime/paths.js";

export async function pairCommand(): Promise<void> {
  const pairingManager = new PairingManager(DATA_DIR);
  const secret = pairingManager.initiatePairing();
  console.log("Pairing initiated.");
  console.log("Secret:", secret);
  console.log("Please confirm this secret in the browser extension popup.");
}
