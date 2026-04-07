import { 
  collection, 
  doc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  deleteDoc,
  onSnapshot
} from 'firebase/firestore';
import { db } from './firebase';
import { BTPDocument } from '../types';

const COLLECTION_NAME = 'documents';

// Internal helper to recursively remove undefined values (Firestore rejects them)
// We replace them with null or delete them.
const cleanData = (obj: any): any => {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(cleanData);
  
  const cleaned: any = {};
  Object.keys(obj).forEach(key => {
    const value = obj[key];
    if (value !== undefined) {
      cleaned[key] = cleanData(value);
    }
  });
  return cleaned;
};

// Helper to interact with the documents collection
export const firestoreService = {
  // Add a new document
  addDocument: async (document: BTPDocument) => {
    try {
      const docRef = doc(db, COLLECTION_NAME, document.id);
      await setDoc(docRef, cleanData(document));
    } catch (error) {
      console.error("Error adding document: ", error);
      throw error;
    }
  },

  // Update an existing document
  updateDocument: async (document: BTPDocument) => {
    try {
      const docRef = doc(db, COLLECTION_NAME, document.id);
      await setDoc(docRef, cleanData(document)); // Use setDoc with a full object is safer after cleaning
    } catch (error) {
      console.error("Error updating document: ", error);
      throw error;
    }
  },

  // Delete a document
  deleteDocument: async (id: string) => {
    try {
      const docRef = doc(db, COLLECTION_NAME, id);
      await deleteDoc(docRef);
    } catch (error) {
      console.error("Error deleting document: ", error);
      throw error;
    }
  },

  // Listen for realtime updates (useful for App.tsx sync)
  subscribeToDocuments: (callback: (docs: BTPDocument[]) => void, onError: (err: any) => void) => {
    const collRef = collection(db, COLLECTION_NAME);
    return onSnapshot(collRef, (snapshot) => {
      const documents: BTPDocument[] = [];
      snapshot.forEach((doc) => {
        documents.push(doc.data() as BTPDocument);
      });
      callback(documents);
    }, (error) => {
      console.error("Error listening to documents: ", error);
      onError(error);
    });
  }
};
