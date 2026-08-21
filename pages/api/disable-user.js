// pages/api/disable-user.js
// Server-side API route that enables/disables a user's login access via the
// Firebase Admin SDK, while leaving their Firestore record (and leave history)
// intact so HR can still view past leave requests for the account.

import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

function initAdmin() {
    if (getApps().length > 0) return;

    const serviceAccountEnv = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (serviceAccountEnv) {
        const serviceAccount = JSON.parse(serviceAccountEnv);
        initializeApp({ credential: cert(serviceAccount) });
    } else {
        initializeApp();
    }
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { userId, disable, actingUserName } = req.body;

    if (!userId || typeof userId !== 'string') {
        return res.status(400).json({ error: 'userId is required' });
    }
    if (typeof disable !== 'boolean') {
        return res.status(400).json({ error: 'disable (boolean) is required' });
    }

    try {
        initAdmin();
        const adminAuth = getAuth();
        const adminDb = getFirestore();

        const userRef = adminDb.collection('users').doc(userId);
        const userSnap = await userRef.get();

        if (!userSnap.exists) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Admin accounts can never be disabled through this endpoint.
        if (disable && userSnap.data().role === 'Admin') {
            return res.status(403).json({ error: 'Admin accounts cannot be disabled' });
        }

        try {
            await adminAuth.updateUser(userId, { disabled: disable });
            if (disable) {
                // Kick out any existing session immediately.
                await adminAuth.revokeRefreshTokens(userId);
            }
        } catch (authError) {
            if (authError.code !== 'auth/user-not-found') throw authError;
        }

        await userRef.update({
            disabled: disable,
            disabledAt: disable ? new Date().toISOString() : null,
            disabledBy: disable ? (actingUserName || null) : null,
        });

        return res.status(200).json({ success: true });
    } catch (error) {
        console.error('[disable-user] Error updating user:', error);
        return res.status(500).json({ error: 'Failed to update user: ' + error.message });
    }
}
