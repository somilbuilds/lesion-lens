export type PatientDetails = {
  name: string;
  gender: string;
};

export type AnalysisHistoryRecord = {
  id: string;
  createdAt: string;
  imageName: string;
  imageType: string;
  image: Blob;
  result: any;
  symptoms: Record<string, boolean>;
  patient: PatientDetails;
  firstNoticed: string;
  notes: string;
};

const DB_NAME = 'skinlesion-local-history';
const STORE_NAME = 'analyses';

function openHistoryDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open local history'));
  });
}

export async function saveAnalysisHistory(record: AnalysisHistoryRecord): Promise<void> {
  const db = await openHistoryDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put(record);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('Could not save analysis history'));
    transaction.onabort = () => reject(transaction.error || new Error('Saving analysis history was cancelled'));
  });
  db.close();
}

export async function updateAnalysisHistory(id: string, changes: Partial<Pick<AnalysisHistoryRecord, 'notes'>>): Promise<void> {
  const db = await openHistoryDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);
    request.onsuccess = () => {
      if (request.result) store.put({ ...request.result, ...changes });
    };
    request.onerror = () => reject(request.error || new Error('Could not update analysis history'));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('Could not update analysis history'));
  });
  db.close();
}

export async function getAnalysisHistory(): Promise<AnalysisHistoryRecord[]> {
  const db = await openHistoryDb();
  const rows = await new Promise<AnalysisHistoryRecord[]>((resolve, reject) => {
    const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result as AnalysisHistoryRecord[]);
    request.onerror = () => reject(request.error || new Error('Could not read local history'));
  });
  db.close();
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function deleteAnalysisHistory(id: string): Promise<void> {
  const db = await openHistoryDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('Could not delete history item'));
  });
  db.close();
}

export async function clearAnalysisHistory(): Promise<void> {
  const db = await openHistoryDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).clear();
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('Could not clear history'));
  });
  db.close();
}
