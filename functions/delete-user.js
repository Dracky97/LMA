const admin = require('firebase-admin');
const serviceAccount = require('./service-account-key.json');

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

const USER_ID_TO_DELETE = 'pyn5rR4xtQUMgfGmHip1q8ckPgY2';

async function deleteUser() {
  console.log('Deleting user:', USER_ID_TO_DELETE);

  const userDocRef = db.collection('users').doc(USER_ID_TO_DELETE);
  const userDoc = await userDocRef.get();

  if (!userDoc.exists) {
    console.log('User document not found:', USER_ID_TO_DELETE);
    return;
  }

  const userData = userDoc.data();
  console.log('Found user document');
  console.log(`  Name: ${userData.name || 'N/A'}`);
  console.log(`  Email: ${userData.email || 'N/A'}`);

  // Delete the user document
  await userDocRef.delete();
  console.log('\nDeleted user document:', USER_ID_TO_DELETE);
  console.log('Done!');
}

deleteUser().catch(console.error);
