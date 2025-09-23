const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");

admin.initializeApp();
const db = admin.firestore();

// Note: Transporter is NOT initialized here anymore.

exports.onLeaveRequestCreate = onDocumentCreated({
    document: "leaveRequests/{requestId}",
    region: "asia-southeast1"
}, async (event) => {
    // Initialize transporter INSIDE the function
    const transporter = nodemailer.createTransport({
        host: "smtp-relay.brevo.com",
        port: 587,
        auth: {
            user: functions.config().brevo.user,
            pass: functions.config().brevo.key
        }
    });

    const snap = event.data;
    if (!snap) {
        console.log("No data associated with the event");
        return;
    }
    const requestData = snap.data();
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
        html: `<p>Hello ${managerData.name},</p><p>${employeeData.name} has submitted a new leave request for your approval.</p><p><strong>Type:</strong> ${requestData.type}</p><p><strong>Reason:</strong> ${requestData.reason}</p><p>Please log in to the HR Portal to review the request.</p>`,
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log("New request email sent to manager:", managerData.email);
    } catch (error) {
        console.error("Error sending email:", error);
    }
});

exports.onLeaveRequestUpdate = onDocumentUpdated({
    document: "leaveRequests/{requestId}",
    region: "asia-southeast1"
}, async (event) => {
    // Initialize transporter INSIDE the function
    const transporter = nodemailer.createTransport({
        host: "smtp-relay.brevo.com",
        port: 587,
        auth: {
            user: functions.config().brevo.user,
            pass: functions.config().brevo.key
        }
    });

    const change = event.data;
    if (!change) {
        console.log("No data associated with the event");
        return;
    }
    const beforeData = change.before.data();
    const afterData = change.after.data();

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
        html: `<p>Hello ${employeeData.name},</p><p>Your leave request has been updated. The new status is: <strong>${afterData.status}</strong>.</p>${afterData.status === 'Rejected' && afterData.rejectionReason ? `<p><strong>Reason for rejection:</strong> ${afterData.rejectionReason}</p>` : ''}<p>You can view the details by logging into the HR Portal.</p>`,
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log("Status update email sent to employee:", employeeData.email);
    } catch (error) {
        console.error("Error sending email:", error);
    }
});

exports.resetAnnualLeaveBalances = onSchedule({
    schedule: "0 0 31 12 *",
    timeZone: "Asia/Colombo",
    region: "asia-southeast1"
}, async (event) => {
    console.log('Starting annual leave balance reset...');
    try {
        const usersSnapshot = await db.collection('users').get();
        const batch = db.batch();
        let updateCount = 0;
        
        usersSnapshot.forEach(doc => {
            const userData = doc.data();
            const userRef = db.collection('users').doc(doc.id);
            const resetBalances = {
                annualLeave: 14, sickLeave: 7, casualLeave: 7, 'leave in-lieu': 0, shortLeave: 12, other: 0
            };
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