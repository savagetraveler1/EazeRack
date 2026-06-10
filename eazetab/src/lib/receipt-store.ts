/**
 * Local receipt file storage for the MVP, backed by IndexedDB.
 *
 * Receipt files (images / PDFs) are too large for localStorage, so blobs live
 * in IndexedDB and the expense record only carries a `local:<id>` reference in
 * `receipt_url`. When Google Drive integration lands, `receipt_url` becomes a
 * Drive link and this store goes away — nothing else has to change.
 */

const DB_NAME = "eazetab-receipts";
const DB_VERSION = 1;
const STORE_NAME = "receipts";

export const LOCAL_RECEIPT_PREFIX = "local:";

export type StoredReceipt = {
  id: string;
  name: string;
  type: string;
  blob: Blob;
  created_at: string;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Saves a receipt file and returns the `local:<id>` reference to store on the expense. */
export async function saveReceipt(file: File): Promise<string> {
  const db = await openDb();
  const receipt: StoredReceipt = {
    id: crypto.randomUUID(),
    name: file.name,
    type: file.type,
    blob: file,
    created_at: new Date().toISOString(),
  };

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(receipt);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();

  return `${LOCAL_RECEIPT_PREFIX}${receipt.id}`;
}

export async function getReceipt(
  receiptUrl: string
): Promise<StoredReceipt | null> {
  if (!receiptUrl.startsWith(LOCAL_RECEIPT_PREFIX)) {
    return null;
  }
  const id = receiptUrl.slice(LOCAL_RECEIPT_PREFIX.length);

  const db = await openDb();
  const receipt = await new Promise<StoredReceipt | null>(
    (resolve, reject) => {
      const request = db
        .transaction(STORE_NAME, "readonly")
        .objectStore(STORE_NAME)
        .get(id);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
    }
  );
  db.close();

  return receipt;
}

export function isLocalReceipt(receiptUrl: string): boolean {
  return receiptUrl.startsWith(LOCAL_RECEIPT_PREFIX);
}
