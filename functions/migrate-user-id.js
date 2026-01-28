const admin = require('firebase-admin');
const serviceAccount = require('./service-account-key.json');

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

const OLD_USER_ID = '5xMk8SEcGAcPU6O0MKm4zTXqYpC3';
const NEW_USER_ID = 'pyn5rR4xtQUMgfGmHip1q8ckPgY2';

async function migrateUserData() {
  console.log('Starting migration...');
  console.log(`Old User ID: ${OLD_USER_ID}`);
  console.log(`New User ID: ${NEW_USER_ID}`);
  console.log('');

  const userDocRef = db.collection('users').doc(OLD_USER_ID);
  const userDoc = await userDocRef.get();

  if (!userDoc.exists) {
    console.log('ERROR: User document not found:', OLD_USER_ID);
    return;
  }

  const userData = userDoc.data();
  console.log('Found user document');
  console.log(`  Name: ${userData.name || 'N/A'}`);
  console.log(`  Email: ${userData.email || 'N/A'}`);

  // Check if new ID already exists
  const newUserDoc = await db.collection('users').doc(NEW_USER_ID).get();
  if (newUserDoc.exists) {
    console.log('\nERROR: New user ID already exists:', NEW_USER_ID);
    return;
  }

  // Create new document with new ID
  await db.collection('users').doc(NEW_USER_ID).set(userData);
  console.log('\nCreated new user document:', NEW_USER_ID);

  // Update any leaveRequests that reference the old user ID
  const requestsSnapshot = await db.collection('leaveRequests')
    .where('userId', '==', OLD_USER_ID)
    .get();

  if (requestsSnapshot.empty) {
    console.log('No leave requests found for this user');
  } else {
    const batch = db.batch();
    let updateCount = 0;

    requestsSnapshot.forEach(docSnapshot => {
      const requestData = docSnapshot.data();
      console.log(`  Updating leave request: ${docSnapshot.id}`);

      // Update the userId reference in the request
      batch.update(docSnapshot.ref, { userId: NEW_USER_ID });
      updateCount++;
    });

    await batch.commit();
    console.log(`Updated ${updateCount} leave requests`);
  }

  // Delete the old document
  await userDocRef.delete();
  console.log('\nDeleted old user document:', OLD_USER_ID);

  console.log('\n========================================');
  console.log('Migration completed successfully!');
  console.log('========================================');
}

migrateUserData().catch(error => {
  console.error('Migration failed:', error);
  process.exit(1);
});
