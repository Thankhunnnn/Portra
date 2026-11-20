import { doc, getDoc, getFirestore, setDoc } from "firebase/firestore/lite";
import { app } from "./firebase";
import type { Settings } from "./sheets";

function settingsDocument(uid: string) {
  return doc(getFirestore(app()), "portraSettings", uid);
}

export async function readSettings(uid: string): Promise<Partial<Settings> | undefined> {
  const snapshot = await getDoc(settingsDocument(uid));
  return snapshot.exists() ? snapshot.data() : undefined;
}

export function writeSettings(uid: string, settings: Settings) {
  const { sheetId, dashboardTab, pricesTab, fxTab, dividendsTab, txTabs, cryptoAccounts, benchmarks, costMethod, separateCash, motion } = settings;
  return setDoc(settingsDocument(uid), { sheetId, dashboardTab, pricesTab, fxTab, dividendsTab, txTabs, cryptoAccounts, benchmarks, costMethod, separateCash, motion });
}
