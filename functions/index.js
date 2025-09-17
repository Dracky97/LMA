/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

const {setGlobalOptions} = require("firebase-functions");
const {onRequest} = require("firebase-functions/https");
const logger = require("firebase-functions/logger");
// FILE: functions/index.js

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");

// Initialize the Firebase Admin SDK
admin.initializeApp();
const db = admin.firestore();

// --- Nodemailer Transporter Configuration for Local Testing ---
const transporter = nodemailer.createTransport({
    host: "localhost",
    port: 2525, // This is the port smtp4dev is listening on
    secure: false, 
});

/**
 * Triggered when a new leave request is created.
 * Sends an email to the manager for approval.
 */
exports.onLeaveRequestCreate = functions.firestore
    .document("leaveRequests/{requestId}")
    .onCreate(async (snap, context) => {
        const requestData = snap.data();

        // Get the manager's and employee's user data from Firestore
        const managerDoc = await db.collection("users").doc(requestData.managerId).get();
        const employeeDoc = await db.collection("users").doc(requestData.userId).get();

        if (!managerDoc.exists || !employeeDoc.exists) {
            console.error("Manager or Employee not found for the request.");
            return;
        }

        const managerData = managerDoc.data();
        const employeeData = employeeDoc.data();

        const mailOptions = {
            from: '"HR Portal" <noreply@hrportal.com>',
            to: managerData.email,
            subject: `New Leave Request from ${employeeData.name}`,
            html: `
                <p>Hello ${managerData.name},</p>
                <p>${employeeData.name} has submitted a new leave request for your approval.</p>
                <p><strong>Type:</strong> ${requestData.type}</p>
                <p><strong>Reason:</strong> ${requestData.reason}</p>
                <p>Please log in to the HR Portal to review the request.</p>
            `,
        };

        try {
            await transporter.sendMail(mailOptions);
            console.log("New request email sent to manager:", managerData.email);
        } catch (error) {
            console.error("Error sending email:", error);
        }
    });

/**
 * Triggered when a leave request is updated.
 * Sends an email to the employee with the status change.
 */
exports.onLeaveRequestUpdate = functions.firestore
    .document("leaveRequests/{requestId}")
    .onUpdate(async (change, context) => {
        const beforeData = change.before.data();
        const afterData = change.after.data();

        // Only send an email if the status has actually changed
        if (beforeData.status === afterData.status) {
            return; 
        }

        const employeeDoc = await db.collection("users").doc(afterData.userId).get();
        if (!employeeDoc.exists) {
            console.error("Employee not found for the request update.");
            return;
        }
        const employeeData = employeeDoc.data();

        const mailOptions = {
            from: '"HR Portal" <noreply@hrportal.com>',
            to: employeeData.email,
            subject: `Update on your leave request: ${afterData.status}`,
            html: `
                <p>Hello ${employeeData.name},</p>
                <p>Your leave request has been updated. The new status is: <strong>${afterData.status}</strong>.</p>
                <p>You can view the details by logging into the HR Portal.</p>
            `,
        };

        try {
            await transporter.sendMail(mailOptions);
            console.log("Status update email sent to employee:", employeeData.email);
        } catch (error) {
            console.error("Error sending email:", error);
        }
    });

/**
 * Scheduled function that runs on December 31st at midnight to reset leave balances
 * for the new year. This function resets all leave types to their standard allocations.
 */
exports.resetAnnualLeaveBalances = functions.pubsub
    .schedule('0 0 31 12 *') // Run at midnight on December 31st every year
    .timeZone('Asia/Colombo') // Sri Lanka timezone
    .onRun(async (context) => {
        console.log('Starting annual leave balance reset...');
        
        try {
            const usersSnapshot = await db.collection('users').get();
            const batch = db.batch();
            let updateCount = 0;
            
            usersSnapshot.forEach(doc => {
                const userData = doc.data();
                const userRef = db.collection('users').doc(doc.id);
                
                // Calculate new annual leave based on current date (should be 14 for January)
                const newAnnualLeave = 14;
                
                // Reset leave balances to standard allocations
                const resetBalances = {
                    annualLeave: newAnnualLeave,
                    sickLeave: 7,
                    casualLeave: 7,
                    'leave in-lieu': 0,
                    shortLeave: 12,
                    other: 0
                };
                
                // Add gender-specific leaves
                if (userData.gender === 'female') {
                    resetBalances.maternityLeave = 84;
                } else if (userData.gender === 'male') {
                    resetBalances.paternityLeave = 3;
                }
                
                batch.update(userRef, { leaveBalance: resetBalances });
                updateCount++;
            });
            
            await batch.commit();
            console.log(`Successfully reset leave balances for ${updateCount} users`);
            
        } catch (error) {
            console.error('Error resetting annual leave balances:', error);
        }
    });


// For cost control, you can set the maximum number of containers that can be
// running at the same time. This helps mitigate the impact of unexpected
// traffic spikes by instead downgrading performance. This limit is a
// per-function limit. You can override the limit for each function using the
// `maxInstances` option in the function's options, e.g.
// `onRequest({ maxInstances: 5 }, (req, res) => { ... })`.
// NOTE: setGlobalOptions does not apply to functions using the v1 API. V1
// functions should each use functions.runWith({ maxInstances: 10 }) instead.
// In the v1 API, each function can only serve one request per container, so
// this will be the maximum concurrent request count.
setGlobalOptions({ maxInstances: 10 });

// Create and deploy your first functions
// https://firebase.google.com/docs/functions/get-started

// exports.helloWorld = onRequest((request, response) => {
//   logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });
