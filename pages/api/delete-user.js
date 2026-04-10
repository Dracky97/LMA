// pages/api/delete-user.js
// Server-side API route that uses Firebase Admin SDK to delete a user
// from both Firestore and Firebase Authentication completely.

import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

/**
 * Initialize Firebase Admin SDK once per serverless instance.
 * Credentials are loaded from the FIREBASE_SERVICE_ACCOUNT environment variable,
 * which should contain the full service account JSON as a string.
 * If running on Firebase/GCP infrastructure, Application Default Credentials
 * (ADC) are used automatically when no env var is present.
 */
function initAdmin() {
    if (getApps().length > 0) return;

    const serviceAccountEnv = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (serviceAccountEnv) {
        const serviceAccount = JSON.parse(serviceAccountEnv);
        initializeApp({ credential: cert(serviceAccount) });
    } else {
        // Fall back to Application Default Credentials (works on GCP/Firebase hosting)
        initializeApp();
    }
}

export default async function handler(req, res) {
    if (req.method !== 'DELETE') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { userId } = req.body;

    if (!userId || typeof userId !== 'string') {
        return res.status(400).json({ error: 'userId is required' });
    }

    try {
        initAdmin();
        const adminAuth = getAuth();
        const adminDb = getFirestore();

        // 1. Delete from Firebase Authentication
        await adminAuth.deleteUser(userId);

        // 2. Delete the user document from Firestore
        await adminDb.collection('users').doc(userId).delete();

        return res.status(200).json({ success: true, message: 'User deleted from Auth and Firestore' });
    } catch (error) {
        console.error('[delete-user] Error deleting user:', error);

        // If the user doesn't exist in Auth, still delete from Firestore
        if (error.code === 'auth/user-not-found') {
            try {
                initAdmin();
                const adminDb = getFirestore();
                await adminDb.collection('users').doc(userId).delete();
                return res.status(200).json({
                    success: true,
                    message: 'User not found in Auth (may have already been removed), deleted from Firestore'
                });
            } catch (firestoreError) {
                console.error('[delete-user] Firestore deletion also failed:', firestoreError);
                return res.status(500).json({ error: 'Failed to delete user from Firestore: ' + firestoreError.message });
            }
        }

        return res.status(500).json({ error: 'Failed to delete user: ' + error.message });
    }
}
