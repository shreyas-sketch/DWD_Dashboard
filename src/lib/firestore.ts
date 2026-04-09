import {
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  getDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  QueryConstraint,
  DocumentData,
  writeBatch,
} from 'firebase/firestore';
import { db } from './firebase';

// ─── Generic helpers ──────────────────────────────────────────────────────────

export async function createDocument<T extends object>(
  collectionPath: string,
  data: T,
  id?: string,
): Promise<string> {
  const payload = { ...data, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  if (id) {
    await setDoc(doc(db, collectionPath, id), payload);
    return id;
  }
  const ref = await addDoc(collection(db, collectionPath), payload);
  return ref.id;
}

export async function updateDocument<T extends object>(
  collectionPath: string,
  id: string,
  data: Partial<T>,
): Promise<void> {
  await updateDoc(doc(db, collectionPath, id), {
    ...data,
    updatedAt: new Date().toISOString(),
  });
}

export async function deleteDocument(collectionPath: string, id: string): Promise<void> {
  await deleteDoc(doc(db, collectionPath, id));
}

export async function getDocument<T>(collectionPath: string, id: string): Promise<T | null> {
  const snap = await getDoc(doc(db, collectionPath, id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as T;
}

export async function queryDocuments<T>(
  collectionPath: string,
  constraints: QueryConstraint[],
): Promise<T[]> {
  const q = query(collection(db, collectionPath), ...constraints);
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as T));
}

export function subscribeToCollection<T>(
  collectionPath: string,
  constraints: QueryConstraint[],
  callback: (data: T[]) => void,
): () => void {
  const q = query(collection(db, collectionPath), ...constraints);
  return onSnapshot(q, (snap) => {
    const data = snap.docs.map((d) => ({ id: d.id, ...d.data() } as T));
    callback(data);
  });
}

// ─── Batch writes ─────────────────────────────────────────────────────────────

export async function batchWrite(
  operations: Array<{
    type: 'set' | 'update' | 'delete';
    path: string;
    id: string;
    data?: DocumentData;
  }>,
): Promise<void> {
  const batch = writeBatch(db);
  for (const op of operations) {
    const ref = doc(db, op.path, op.id);
    if (op.type === 'set') batch.set(ref, { ...op.data, updatedAt: new Date().toISOString() });
    else if (op.type === 'update') batch.update(ref, { ...op.data, updatedAt: new Date().toISOString() });
    else if (op.type === 'delete') batch.delete(ref);
  }
  await batch.commit();
}
