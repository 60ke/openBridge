import { PairingManager } from "../bridge/pairing.js";

export async function resetPairingCommand(): Promise<void> {
  const pairingManager = new PairingManager();
  pairingManager.resetPairing();
  console.log("Pairing has been reset. You will need to pair again with the extension.");
}
