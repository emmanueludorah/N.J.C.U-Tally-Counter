import { initializeApp } from 'firebase/app'
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  deleteDoc,
  getDocs,
  onSnapshot,
  query,
  orderBy,
} from 'firebase/firestore'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyDOf77vfyouM53PlwSCvRMPpb-AZuem4JA',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'tally-counter-4081f.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'tally-counter-4081f',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'tally-counter-4081f.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '655237108568',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:655237108568:web:323e10e46ecd0237dc0b2d',
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || 'G-QJMDWET5KQ',
}

const app = initializeApp(firebaseConfig)
export const db = getFirestore(app)

const SUBMISSIONS_COLLECTION = 'submissions'

/**
 * Uploads a tally submission to Firestore.
 */
export async function submitTallyToCloud(submission) {
  const docRef = doc(db, SUBMISSIONS_COLLECTION, submission.id)
  await setDoc(docRef, submission)
}

/**
 * Subscribes to live updates from the submissions collection.
 * Calls onUpdate with an array of submissions whenever the data changes in the cloud.
 */
export function subscribeToSubmissions(onUpdate, onError) {
  const q = query(
    collection(db, SUBMISSIONS_COLLECTION),
    orderBy('submittedAt', 'desc'),
  )

  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }))
      onUpdate(items)
    },
    (error) => {
      console.warn('Firestore subscription error (falling back to local):', error)
      if (onError) onError(error)
    },
  )
}

/**
 * Removes a single submission from Firestore.
 */
export async function deleteSubmissionFromCloud(id) {
  const docRef = doc(db, SUBMISSIONS_COLLECTION, id)
  await deleteDoc(docRef)
}

/**
 * Deletes all submissions from Firestore.
 */
export async function clearAllSubmissionsFromCloud() {
  const snap = await getDocs(collection(db, SUBMISSIONS_COLLECTION))
  const deletePromises = snap.docs.map((d) => deleteDoc(d.ref))
  await Promise.all(deletePromises)
}
