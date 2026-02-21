import { initializeApp } from "firebase/app";
import { 
  getFirestore, 
  collection, 
  onSnapshot as firestoreOnSnapshot, 
  doc, 
  setDoc,
  updateDoc,
  deleteDoc,
  runTransaction as firestoreRunTransaction,
  serverTimestamp,
  query
} from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getAnalytics } from "firebase/analytics";

// আপনার Firebase কনফিগারেশন
const firebaseConfig = {
  apiKey: "AIzaSyAJPnGWWGLje1pULYbqOr8TSd1kTR5Yncc",
  authDomain: "onlineshs.firebaseapp.com",
  projectId: "onlineshs",
  storageBucket: "onlineshs.firebasestorage.app",
  messagingSenderId: "394635528009",
  appId: "1:394635528009:web:642b2096c1c28a615b7c98",
  measurementId: "G-TSFWW6Y93V"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const dbInstance = getFirestore(app);
export const auth = getAuth(app);

// Analytics (বড় স্ক্রিনে ব্যবহারের জন্য)
// Analytics is disabled to prevent "Installations" errors with invalid/restricted API keys.
export const analytics = null;

/**
 * অ্যাপের অন্যান্য কম্পোনেন্টের সাথে সামঞ্জস্য রাখার জন্য এক্সপোর্ট
 * (Compatibility Layer for existing AdminDashboard and CustomerDashboard)
 */

let localCache: Record<string, any[]> = {};

// ১. Real-time ডাটা শোনার জন্য onSnapshot
export const onSnapshot = (collectionName: string, callback: (snap: any) => void) => {
  const q = query(collection(dbInstance, collectionName));
  return firestoreOnSnapshot(q, (snapshot) => {
    const docsData = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    // Update local cache for db.get compatibility
    localCache[collectionName] = docsData;
    
    // Return compatibility object with 'docs' property
    callback({
      docs: snapshot.docs.map(d => ({
        id: d.id,
        data: () => ({ id: d.id, ...d.data() })
      }))
    });
  });
};

// ২. ডাটা আপডেট বা ডিলিট করার জন্য runTransaction
export const runTransaction = async (action: any) => {
  // Support for old function-based signature
  if (typeof action === 'function') {
    return await firestoreRunTransaction(dbInstance, async (transaction) => {
      const tx = {
        update: (path: string, data: any) => {
          const [col, id] = path.split(':');
          transaction.update(doc(dbInstance, col, id), { ...data, updatedAt: serverTimestamp() });
        },
        set: (col: string, data: any) => {
          const id = data.id;
          if (!id) throw new Error("Document ID is required");
          transaction.set(doc(dbInstance, col, id), { ...data, createdAt: serverTimestamp() });
        },
        delete: (col: string, id: string) => {
          transaction.delete(doc(dbInstance, col, id));
        }
      };
      return await action(tx);
    });
  }

  // Support for new object-based signature requested by user
  return await firestoreRunTransaction(dbInstance, async (transaction) => {
    const docRef = action.id ? doc(dbInstance, action.collection, action.id) : null;

    if (action.type === 'delete' && docRef) {
      transaction.delete(docRef);
    } else if (action.type === 'update' && docRef) {
      transaction.update(docRef, { ...action.data, updatedAt: serverTimestamp() });
    } else if (action.type === 'set' && docRef) {
      transaction.set(docRef, { ...action.data, createdAt: serverTimestamp() });
    }
  });
};

// ৩. পুরনো কোডের সাথে মিল রাখার জন্য db অবজেক্ট
export const db = {
  get: (collectionName: string) => localCache[collectionName] || []
};

export default app;
