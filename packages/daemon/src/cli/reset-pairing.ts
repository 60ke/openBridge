import { PairingManager } from "../bridge/pairing.js";
import { DATA_DIR } from "../runtime/paths.js";

export async function resetPairingCommand(): Promise<void> {
  const pairingManager = new PairingManager(DATA_DIR);
  pairingManager.resetPairing();
  console.log("Pairing has been reset. You will need to pair again with the extension.");
}
