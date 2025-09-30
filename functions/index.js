const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");

// Initialize Firebase Admin SDK
admin.initializeApp();
const db = admin.firestore();

exports.onLeaveRequestCreate = onDocumentCreated({
    document: "leaveRequests/{requestId}",
    region: "asia-southeast1"
}, async (event) => {
    // Initialize transporter using new environment variables
    const transporter = nodemailer.createTransport({
        host: "mail.aibs.edu.lk",
        port: 465,
        secure: true, // Use true for port 465
        auth: {
            user: process.env.EMAIL_USER, // Correct v2 method
            pass: process.env.EMAIL_PASS  // Correct v2 method
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
        from: '"HRMS Portal" <hrms@aibs.edu.lk>',
        to: managerData.email,
        subject: `New Leave Request from ${employeeData.name}`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #1e293b; border-bottom: 2px solid #3b82f6; padding-bottom: 10px;">New Leave Request</h2>

                <p>Hello <strong>${managerData.name}</strong>,</p>

                <p><strong>${employeeData.name}</strong> has submitted a new leave request for your approval.</p>

                <div style="background-color: #f8fafc; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #3b82f6;">
                    <p style="margin: 5px 0;"><strong>Employee:</strong> <span style="color: #1e293b; font-weight: bold;">${employeeData.name}</span></p>
                    <p style="margin: 5px 0;"><strong>Leave Type:</strong> <span style="color: #1e293b; font-weight: bold;">${requestData.type}</span></p>
                    <p style="margin: 5px 0;"><strong>Duration:</strong> <span style="color: #1e293b; font-weight: bold;">${requestData.totalDays || requestData.leaveUnits || 'N/A'} day(s)</span></p>
                    <p style="margin: 5px 0;"><strong>Department:</strong> ${employeeData.department || 'N/A'}</p>
                    ${requestData.reason ? `<p style="margin: 5px 0;"><strong>Reason:</strong> ${requestData.reason}</p>` : ''}
                    <p style="margin: 5px 0;"><strong>Applied On:</strong> ${new Date(requestData.appliedOn._seconds * 1000).toLocaleDateString()}</p>
                </div>

                <div style="text-align: center; margin: 30px 0;">
                    <a href="https://leave-management-app-20ee9.firebaseapp.com/team-requests"
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
        `,
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
    // Initialize transporter using new environment variables
    const transporter = nodemailer.createTransport({
        host: "mail.aibs.edu.lk",
        port: 465,
        secure: true, // Use true for port 465
        auth: {
            user: process.env.EMAIL_USER, // Correct v2 method
            pass: process.env.EMAIL_PASS  // Correct v2 method
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
        from: '"HRMS Portal" <hrms@aibs.edu.lk>',
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

// Function to send performance evaluation reminders
exports.sendPerformanceEvaluationReminders = onSchedule({
    schedule: "0 9 * * *", // Daily at 9 AM
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

            // Check if user has a next evaluation date
            if (userData.nextEvaluationDate) {
                const nextEvaluationDate = new Date(userData.nextEvaluationDate);

                // Check if evaluation is exactly 3 days from now
                if (nextEvaluationDate.toDateString() === threeDaysFromNow.toDateString()) {
                    // Send reminder email to user
                    await sendEvaluationReminder(userData, 'employee');

                    // Send reminder email to HR managers
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

        console.log(`Sent ${reminderCount} performance evaluation reminders`);
    } catch (error) {
        console.error('Error sending performance evaluation reminders:', error);
    }
});

// Function to update evaluation dates after evaluation
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

    // Check if employee status was changed (indicating evaluation completion)
    if (beforeData.employeeStatus !== afterData.employeeStatus) {
        const userRef = db.collection('users').doc(afterData.uid || event.params.userId);

        // Calculate next evaluation date (3 months from now)
        const nextEvaluationDate = new Date();
        nextEvaluationDate.setMonth(nextEvaluationDate.getMonth() + 3);

        await userRef.update({
            nextEvaluationDate: nextEvaluationDate.toISOString(),
            lastEvaluationDate: new Date().toISOString()
        });

        console.log(`Updated evaluation schedule for user ${afterData.name}`);
    }
});

// Helper function to send evaluation reminder emails
async function sendEvaluationReminder(userData, recipientType, hrData = null) {
    const transporter = nodemailer.createTransporter({
        host: "mail.aibs.edu.lk",
        port: 465,
        secure: true,
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        }
    });

    let mailOptions;
    let subject;
    let recipientEmail;
    let recipientName;

    if (recipientType === 'employee') {
        subject = 'Performance Evaluation Reminder - 3 Days';
        recipientEmail = userData.email;
        recipientName = userData.name;
        mailOptions = {
            from: '"HRMS Portal" <hrms@aibs.edu.lk>',
            to: recipientEmail,
            subject: subject,
            html: `
                <p>Hello ${recipientName},</p>
                <p>This is a reminder that your performance evaluation is scheduled for <strong>${new Date(userData.nextEvaluationDate).toLocaleDateString()}</strong> (3 days from now).</p>
                <p>Please prepare any relevant documentation or feedback you would like to discuss during your evaluation.</p>
                <p>If you have any questions, please contact your HR manager.</p>
                <p>Best regards,<br/>HRMS Team</p>
            `
        };
    } else if (recipientType === 'hr' && hrData) {
        subject = `Performance Evaluation Reminder - ${userData.name}`;
        recipientEmail = hrData.email;
        recipientName = hrData.name;
        mailOptions = {
            from: '"HRMS Portal" <hrms@aibs.edu.lk>',
            to: recipientEmail,
            subject: subject,
            html: `
                <p>Hello ${recipientName},</p>
                <p>This is a reminder that <strong>${userData.name}</strong>'s performance evaluation is scheduled for <strong>${new Date(userData.nextEvaluationDate).toLocaleDateString()}</strong> (3 days from now).</p>
                <p><strong>Employee Details:</strong></p>
                <ul>
                    <li>Department: ${userData.department}</li>
                    <li>Current Status: ${userData.employeeStatus}</li>
                    <li>Joined Date: ${userData.joinedDate ? new Date(userData.joinedDate).toLocaleDateString() : 'Not set'}</li>
                </ul>
                <p>Please ensure the evaluation is conducted on time and update the employee's status if necessary.</p>
                <p>Best regards,<br/>HRMS Team</p>
            `
        };
    }

    try {
        await transporter.sendMail(mailOptions);
        console.log(`Evaluation reminder sent to ${recipientType}: ${recipientEmail}`);
    } catch (error) {
        console.error(`Error sending evaluation reminder to ${recipientType}:`, error);
    }
}

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