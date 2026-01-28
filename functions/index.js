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
// CLOUD FUNCTIONS
// -----------------------------------------------------------

exports.onLeaveRequestCreate = onDocumentCreated({
    document: "leaveRequests/{requestId}",
    region: "asia-southeast1"
}, async (event) => {
    const transporter = nodemailer.createTransport({
        host: "mail.aibs.edu.lk",
        port: 465,
        secure: true,
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
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

    // Format dates for display
    const startDate = new Date(requestData.startDate._seconds * 1000).toLocaleDateString();
    const endDate = new Date(requestData.endDate._seconds * 1000).toLocaleDateString();
    const appliedDate = new Date(requestData.appliedOn._seconds * 1000).toLocaleDateString();

    const mailOptions = {
        from: '"HRMS Portal" <hrms@aibs.edu.lk>',
        to: managerData.email,
        subject: `New Leave Request from ${employeeData.name}`,
        html: leaveRequestTemplate(managerData.name, employeeData.name, requestData, startDate, endDate, appliedDate)
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
    const transporter = nodemailer.createTransport({
        host: "mail.aibs.edu.lk",
        port: 465,
        secure: true,
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
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

    // Format dates for display
    const startDate = new Date(afterData.startDate._seconds * 1000).toLocaleDateString();
    const endDate = new Date(afterData.endDate._seconds * 1000).toLocaleDateString();

    const mailOptions = {
        from: '"HRMS Portal" <hrms@aibs.edu.lk>',
        to: employeeData.email,
        subject: `Update on your leave request: ${afterData.status}`,
        html: leaveUpdateTemplate(employeeData.name, startDate, endDate, afterData.status, afterData.rejectionReason)
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log("Status update email sent to employee:", employeeData.email);
    } catch (error) {
        console.error("Error sending email:", error);
    }
});

exports.sendPerformanceEvaluationReminders = onSchedule({
    schedule: "0 9 * * *",
    timeZone: "Asia/Colombo",
    region: "asia-southeast1"
}, async (event) => {
    console.log('Starting performance evaluation reminder check...');
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
                    await sendEvaluationReminder(userData, 'employee');

                    const hrManagersSnapshot = await db.collection('users')
                        .where('role', 'in', ['Manager HR', 'Admin'])
                        .get();

                    for (const hrDoc of hrManagersSnapshot.docs) {
                        const hrData = hrDoc.data();
                        await sendEvaluationReminder(userData, 'hr', hrData);
                    }

                    reminderCount++;
                }
            }
        }

        console.log(`Sent ${reminderCount} performance evaluation reminders`);
    } catch (error) {
        console.error('Error sending performance evaluation reminders:', error);
    }
});

exports.resetMonthlyShortLeave = onSchedule({
    schedule: "0 0 1 * *",
    timeZone: "Asia/Colombo",
    region: "asia-southeast1"
}, async (event) => {
    console.log('Starting monthly short leave reset...');
    try {
        const usersSnapshot = await db.collection('users').get();
        const currentDate = new Date().toISOString();
        let resetCount = 0;

        const batch = db.batch();

        for (const doc of usersSnapshot.docs) {
            const userData = doc.data();
            const userRef = db.collection('users').doc(doc.id);

            // Reset short leave balance to 3 for all users
            batch.update(userRef, {
                'leaveBalance.shortLeave': 3,
                'leaveAllocations.shortLeave': 3,
                shortLeaveLastReset: currentDate,
                shortLeaveResetBy: 'Automated System'
            });

            resetCount++;
        }

        await batch.commit();

        console.log(`Successfully reset short leave balances for ${resetCount} users`);
    } catch (error) {
        console.error('Error resetting monthly short leave:', error);
    }
});

exports.onPerformanceEvaluationComplete = onDocumentUpdated({
    document: "users/{userId}",
    region: "asia-southeast1"
}, async (event) => {
    const change = event.data;
    if (!change) {
        console.log("No data associated with the event");
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

        console.log(`Updated evaluation schedule for user ${afterData.name}`);
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