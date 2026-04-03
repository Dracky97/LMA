// File: functions/index.js

const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");

// Initialize Firebase Admin SDK
admin.initializeApp();
const db = admin.firestore();

// -----------------------------------------------------------
// SMTP TRANSPORTER FACTORY
// Creates a new transporter and validates env vars are present
// -----------------------------------------------------------

function createTransporter() {
    const emailUser = process.env.EMAIL_USER;
    const emailPass = process.env.EMAIL_PASS;

    if (!emailUser || !emailPass) {
        console.error(
            "[EMAIL CONFIG ERROR] Missing SMTP credentials. " +
            `EMAIL_USER is ${emailUser ? "SET" : "NOT SET"}, ` +
            `EMAIL_PASS is ${emailPass ? "SET" : "NOT SET"}. ` +
            "Set them via: firebase functions:secrets:set EMAIL_USER EMAIL_PASS"
        );
        return null;
    }

    return nodemailer.createTransport({
        host: "mail.aibs.edu.lk",
        port: 465,
        secure: true,
        auth: {
            user: emailUser,
            pass: emailPass
        }
    });
}

// -----------------------------------------------------------
// SAFE DATE FORMATTER
// Handles both Firestore Timestamps and ISO strings
// -----------------------------------------------------------

function formatDate(dateField) {
    if (!dateField) return "N/A";
    // Firestore Timestamp object has _seconds
    if (dateField._seconds !== undefined) {
        return new Date(dateField._seconds * 1000).toLocaleDateString();
    }
    // Firestore Timestamp object from admin SDK has seconds (no underscore)
    if (dateField.seconds !== undefined) {
        return new Date(dateField.seconds * 1000).toLocaleDateString();
    }
    // Plain ISO string or Date
    const d = new Date(dateField);
    return isNaN(d.getTime()) ? String(dateField) : d.toLocaleDateString();
}

// -----------------------------------------------------------
// EMAIL TEMPLATES
// -----------------------------------------------------------

// Template for new leave requests sent to the manager
const leaveRequestTemplate = (managerName, employeeName, requestData, startDate, endDate, appliedDate) => `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1e293b; border-bottom: 2px solid #3b82f6; padding-bottom: 10px;">New Leave Request</h2>

        <p>Hello <strong>${managerName}</strong>,</p>

        <p><strong>${employeeName}</strong> has submitted a new leave request for your approval.</p>

        <div style="background-color: #f8fafc; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #3b82f6;">
            <p style="margin: 5px 0;"><strong>Employee:</strong> <span style="color: #1e293b; font-weight: bold;">${employeeName}</span></p>
            <p style="margin: 5px 0;"><strong>Leave Type:</strong> <span style="color: #1e293b; font-weight: bold;">${requestData.type}</span></p>
            <p style="margin: 5px 0;"><strong>Dates:</strong> <span style="color: #1e293b; font-weight: bold;">${startDate} - ${endDate}</span></p>
            <p style="margin: 5px 0;"><strong>Duration:</strong> <span style="color: #1e293b; font-weight: bold;">${requestData.leaveUnits || 'N/A'} day(s)</span></p>
            <p style="margin: 5px 0;"><strong>Department:</strong> ${requestData.department || 'N/A'}</p>
            ${requestData.reason ? `<p style="margin: 5px 0;"><strong>Reason:</strong> ${requestData.reason}</p>` : ''}
            <p style="margin: 5px 0;"><strong>Applied On:</strong> ${appliedDate}</p>
        </div>

        <div style="text-align: center; margin: 30px 0;">
            <a href="https://hrms.aibs.edu.lk/team-requests"
               style="background-color: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
                Review Team Requests
            </a>
        </div>

        <p style="color: #64748b; font-size: 14px;">
            You can also log in to the HR Portal and navigate to "Team Requests" to review this and other pending requests.
        </p>

        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;">

        <p style="color: #64748b; font-size: 12px; text-align: center;">
            This is an automated message from the HRMS Portal. Please do not reply to this email.
        </p>
    </div>
`;

// Template for leave status updates sent to the employee
const leaveUpdateTemplate = (employeeName, startDate, endDate, status, rejectionReason) => `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1e293b; border-bottom: 2px solid #3b82f6; padding-bottom: 10px;">Leave Request Update</h2>
        <p>Hello <strong>${employeeName}</strong>,</p>
        <p>Your leave request for <strong>${startDate} - ${endDate}</strong> has been updated. <br>The new status is: <strong>${status}</strong>.</p>
        ${rejectionReason ? `<p><strong>Reason for rejection:</strong> ${rejectionReason}</p>` : ''}
        <div style="text-align: center; margin: 30px 0;">
            <a href="https://hrms.aibs.edu.lk/dashboard"
               style="background-color: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
                View Your Dashboard
            </a>
        </div>
        <p>You can view the full details by logging into the HR Portal.</p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;">
        <p style="color: #64748b; font-size: 12px; text-align: center;">
            This is an automated message from the HRMS Portal. Please do not reply to this email.
        </p>
    </div>
`;

// Template for evaluation reminders sent to employee and HR
const evaluationReminderTemplate = (recipientType, userData, hrData) => {
    const evaluationDate = new Date(userData.nextEvaluationDate).toLocaleDateString();
    
    if (recipientType === 'employee') {
        return `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #1e293b; border-bottom: 2px solid #3b82f6; padding-bottom: 10px;">Performance Evaluation Reminder</h2>
                <p>Hello <strong>${userData.name}</strong>,</p>
                <p>This is a reminder that your performance evaluation is scheduled for <strong>${evaluationDate}</strong> (3 days from now).</p>
                <p>Please prepare any relevant documentation or feedback you would like to discuss during your evaluation.</p>
                <p>If you have any questions, please contact your HR manager.</p>
                <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;">
                <p style="color: #64748b; font-size: 12px; text-align: center;">
                    This is an automated message from the HRMS Portal. Please do not reply to this email.
                </p>
            </div>
        `;
    }

    if (recipientType === 'hr' && hrData) {
        return `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #1e293b; border-bottom: 2px solid #3b82f6; padding-bottom: 10px;">Performance Evaluation Reminder</h2>
                <p>Hello <strong>${hrData.name}</strong>,</p>
                <p>This is a reminder that <strong>${userData.name}</strong>'s performance evaluation is scheduled for <strong>${evaluationDate}</strong> (3 days from now).</p>
                <div style="background-color: #f8fafc; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #3b82f6;">
                    <p style="margin: 5px 0;"><strong>Employee:</strong> <span style="color: #1e293b; font-weight: bold;">${userData.name}</span></p>
                    <p style="margin: 5px 0;"><strong>Department:</strong> <span style="color: #1e293b; font-weight: bold;">${userData.department || 'N/A'}</span></p>
                    <p style="margin: 5px 0;"><strong>Current Status:</strong> <span style="color: #1e293b; font-weight: bold;">${userData.employeeStatus || 'Not set'}</span></p>
                    <p style="margin: 5px 0;"><strong>Joined Date:</strong> <span style="color: #1e293b; font-weight: bold;">${userData.joinedDate ? new Date(userData.joinedDate).toLocaleDateString() : 'Not set'}</span></p>
                </div>
                <p>Please ensure the evaluation is conducted on time and update the employee's status if necessary.</p>
                <div style="text-align: center; margin: 30px 0;">
                    <a href="https://hrms.aibs.edu.lk/admin-dashboard"
                       style="background-color: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
                        Go to Admin Dashboard
                    </a>
                </div>
                <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;">
                <p style="color: #64748b; font-size: 12px; text-align: center;">
                    This is an automated message from the HRMS Portal. Please do not reply to this email.
                </p>
            </div>
        `;
    }
};

// -----------------------------------------------------------
// HELPER: Send evaluation reminder email
// FIX: This function was called in sendPerformanceEvaluationReminders
//      but was never defined — causing a ReferenceError crash.
// -----------------------------------------------------------

async function sendEvaluationReminder(userData, recipientType, hrData = null) {
    const transporter = createTransporter();
    if (!transporter) {
        console.error("[sendEvaluationReminder] Cannot send email: transporter creation failed (missing credentials).");
        return;
    }

    const recipientEmail = recipientType === 'employee' ? userData.email : hrData && hrData.email;
    const recipientName = recipientType === 'employee' ? userData.name : hrData && hrData.name;

    if (!recipientEmail) {
        console.error(
            `[sendEvaluationReminder] No email address found for ${recipientType}. ` +
            `userData.name=${userData.name}, hrData=${hrData ? hrData.name : 'N/A'}`
        );
        return;
    }

    const htmlBody = evaluationReminderTemplate(recipientType, userData, hrData);
    if (!htmlBody) {
        console.error(`[sendEvaluationReminder] Template returned empty for recipientType="${recipientType}"`);
        return;
    }

    const mailOptions = {
        from: '"HRMS Portal" <hrms@aibs.edu.lk>',
        to: recipientEmail,
        subject: `Performance Evaluation Reminder: ${userData.name}`,
        html: htmlBody
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`[sendEvaluationReminder] Reminder sent to ${recipientType} (${recipientEmail}) for employee ${userData.name}`);
    } catch (error) {
        console.error(
            `[sendEvaluationReminder] Failed to send to ${recipientEmail}. ` +
            `Error code: ${error.code}, message: ${error.message}`
        );
    }
}

// -----------------------------------------------------------
// CLOUD FUNCTIONS
// -----------------------------------------------------------

exports.onLeaveRequestCreate = onDocumentCreated({
    document: "leaveRequests/{requestId}",
    region: "asia-southeast1"
}, async (event) => {
    const transporter = createTransporter();
    if (!transporter) {
        console.error("[onLeaveRequestCreate] Aborting: transporter creation failed.");
        return;
    }

    const snap = event.data;
    if (!snap) {
        console.log("[onLeaveRequestCreate] No data associated with the event");
        return;
    }

    const requestData = snap.data();

    // Validate required fields before Firestore lookups
    if (!requestData.managerId) {
        console.error("[onLeaveRequestCreate] requestData.managerId is missing. Cannot send email.");
        return;
    }
    if (!requestData.userId) {
        console.error("[onLeaveRequestCreate] requestData.userId is missing. Cannot send email.");
        return;
    }

    const managerDoc = await db.collection("users").doc(requestData.managerId).get();
    const employeeDoc = await db.collection("users").doc(requestData.userId).get();

    if (!managerDoc.exists) {
        console.error(`[onLeaveRequestCreate] Manager not found in Firestore. managerId="${requestData.managerId}"`);
        return;
    }
    if (!employeeDoc.exists) {
        console.error(`[onLeaveRequestCreate] Employee not found in Firestore. userId="${requestData.userId}"`);
        return;
    }

    const managerData = managerDoc.data();
    const employeeData = employeeDoc.data();

    if (!managerData.email) {
        console.error(`[onLeaveRequestCreate] Manager has no email field. managerId="${requestData.managerId}"`);
        return;
    }

    // Format dates safely — handles both Firestore Timestamps and ISO strings
    const startDate = formatDate(requestData.startDate);
    const endDate = formatDate(requestData.endDate);
    const appliedDate = formatDate(requestData.appliedOn);

    const mailOptions = {
        from: '"HRMS Portal" <hrms@aibs.edu.lk>',
        to: managerData.email,
        subject: `New Leave Request from ${employeeData.name}`,
        html: leaveRequestTemplate(managerData.name, employeeData.name, requestData, startDate, endDate, appliedDate)
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`[onLeaveRequestCreate] Email sent to manager: ${managerData.email}`);
    } catch (error) {
        console.error(
            `[onLeaveRequestCreate] Failed to send email to ${managerData.email}. ` +
            `Error code: ${error.code}, message: ${error.message}, ` +
            `SMTP response: ${error.response || 'N/A'}`
        );
    }
});

exports.onLeaveRequestUpdate = onDocumentUpdated({
    document: "leaveRequests/{requestId}",
    region: "asia-southeast1"
}, async (event) => {
    const transporter = createTransporter();
    if (!transporter) {
        console.error("[onLeaveRequestUpdate] Aborting: transporter creation failed.");
        return;
    }

    const change = event.data;
    if (!change) {
        console.log("[onLeaveRequestUpdate] No data associated with the event");
        return;
    }

    const beforeData = change.before.data();
    const afterData = change.after.data();

    if (beforeData.status === afterData.status) {
        console.log("[onLeaveRequestUpdate] Status unchanged, skipping email.");
        return;
    }

    if (!afterData.userId) {
        console.error("[onLeaveRequestUpdate] afterData.userId is missing. Cannot send email.");
        return;
    }

    const employeeDoc = await db.collection("users").doc(afterData.userId).get();
    if (!employeeDoc.exists) {
        console.error(`[onLeaveRequestUpdate] Employee not found in Firestore. userId="${afterData.userId}"`);
        return;
    }

    const employeeData = employeeDoc.data();

    if (!employeeData.email) {
        console.error(`[onLeaveRequestUpdate] Employee has no email field. userId="${afterData.userId}"`);
        return;
    }

    // Format dates safely — handles both Firestore Timestamps and ISO strings
    const startDate = formatDate(afterData.startDate);
    const endDate = formatDate(afterData.endDate);

    const mailOptions = {
        from: '"HRMS Portal" <hrms@aibs.edu.lk>',
        to: employeeData.email,
        subject: `Update on your leave request: ${afterData.status}`,
        html: leaveUpdateTemplate(employeeData.name, startDate, endDate, afterData.status, afterData.rejectionReason)
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`[onLeaveRequestUpdate] Status update email sent to employee: ${employeeData.email}`);
    } catch (error) {
        console.error(
            `[onLeaveRequestUpdate] Failed to send email to ${employeeData.email}. ` +
            `Error code: ${error.code}, message: ${error.message}, ` +
            `SMTP response: ${error.response || 'N/A'}`
        );
    }
});

exports.sendPerformanceEvaluationReminders = onSchedule({
    schedule: "0 9 * * *",
    timeZone: "Asia/Colombo",
    region: "asia-southeast1"
}, async (event) => {
    console.log('[sendPerformanceEvaluationReminders] Starting performance evaluation reminder check...');
    try {
        const usersSnapshot = await db.collection('users').where('role', '==', 'Employee').get();
        const today = new Date();
        const threeDaysFromNow = new Date(today);
        threeDaysFromNow.setDate(today.getDate() + 3);

        let reminderCount = 0;

        for (const doc of usersSnapshot.docs) {
            const userData = doc.data();

            if (userData.nextEvaluationDate) {
                const nextEvaluationDate = new Date(userData.nextEvaluationDate);

                if (nextEvaluationDate.toDateString() === threeDaysFromNow.toDateString()) {
                    const hrManagersSnapshot = await db.collection('users')
                        .where('role', '==', 'Manager HR')
                        .get();

                    for (const hrDoc of hrManagersSnapshot.docs) {
                        const hrData = hrDoc.data();
                        await sendEvaluationReminder(userData, 'hr', hrData);
                    }

                    reminderCount++;
                }
            }
        }

        console.log(`[sendPerformanceEvaluationReminders] Sent ${reminderCount} performance evaluation reminders`);
    } catch (error) {
        console.error('[sendPerformanceEvaluationReminders] Error:', error.message);
    }
});

exports.resetMonthlyShortLeave = onSchedule({
    schedule: "0 0 1 * *",
    timeZone: "Asia/Colombo",
    region: "asia-southeast1"
}, async (event) => {
    console.log('[resetMonthlyShortLeave] Starting monthly short leave reset...');
    try {
        const usersSnapshot = await db.collection('users').get();
        const currentDate = new Date().toISOString();
        let resetCount = 0;

        const batch = db.batch();

        for (const doc of usersSnapshot.docs) {
            const userRef = db.collection('users').doc(doc.id);

            // Reset short leave balance to 3 for all users (monthly reset, no annual allocation)
            batch.update(userRef, {
                'leaveBalance.shortLeave': 3,
                shortLeaveLastReset: currentDate,
                shortLeaveResetBy: 'Automated System'
            });

            resetCount++;
        }

        await batch.commit();

        console.log(`[resetMonthlyShortLeave] Successfully reset short leave balances for ${resetCount} users`);
    } catch (error) {
        console.error('[resetMonthlyShortLeave] Error:', error.message);
    }
});

exports.onPerformanceEvaluationComplete = onDocumentUpdated({
    document: "users/{userId}",
    region: "asia-southeast1"
}, async (event) => {
    const change = event.data;
    if (!change) {
        console.log("[onPerformanceEvaluationComplete] No data associated with the event");
        return;
    }

    const beforeData = change.before.data();
    const afterData = change.after.data();

    if (beforeData.employeeStatus !== afterData.employeeStatus) {
        const userRef = db.collection('users').doc(afterData.uid || event.params.userId);
        const nextEvaluationDate = new Date();
        nextEvaluationDate.setMonth(nextEvaluationDate.getMonth() + 3);

        await userRef.update({
            nextEvaluationDate: nextEvaluationDate.toISOString(),
            lastEvaluationDate: new Date().toISOString()
        });

        console.log(`[onPerformanceEvaluationComplete] Updated evaluation schedule for user ${afterData.name}`);
    }
});


// API function to handle Next.js API routes
exports.api = onRequest({
    region: "asia-southeast1",
    cors: true
}, async (req, res) => {
    // Handle API routes that were in pages/api/
    if (req.path === "/api/hello") {
        res.status(200).json({ name: "John Doe" });
        return;
    }

    // Default response for unmatched routes
    res.status(404).json({ error: "Not Found" });
});
