// File: functions/index.js

const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
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

// Template for escalation email sent to HR when a request needs HR approval
const escalationTemplate = (hrName, employeeName, managerName, requestData, startDate, endDate) => `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1e293b; border-bottom: 2px solid #f59e0b; padding-bottom: 10px;">Leave Request Escalated to HR</h2>
        <p>Hello <strong>${hrName}</strong>,</p>
        <p>A leave request from <strong>${employeeName}</strong> has been escalated to HR for final approval by their manager <strong>${managerName}</strong>.</p>
        <div style="background-color: #fffbeb; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b;">
            <p style="margin: 5px 0;"><strong>Employee:</strong> ${employeeName}</p>
            <p style="margin: 5px 0;"><strong>Leave Type:</strong> ${requestData.type}</p>
            <p style="margin: 5px 0;"><strong>Dates:</strong> ${startDate} - ${endDate}</p>
            <p style="margin: 5px 0;"><strong>Duration:</strong> ${requestData.leaveUnits || 'N/A'} day(s)</p>
            ${requestData.reason ? `<p style="margin: 5px 0;"><strong>Reason:</strong> ${requestData.reason}</p>` : ''}
            <p style="margin: 5px 0;"><strong>Escalated By:</strong> ${managerName}</p>
        </div>
        <div style="text-align: center; margin: 30px 0;">
            <a href="https://hrms.aibs.edu.lk/dashboard"
               style="background-color: #f59e0b; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
                Review in HR Dashboard
            </a>
        </div>
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

    // Send email to employee about status update
    const employeeMailOptions = {
        from: '"HRMS Portal" <hrms@aibs.edu.lk>',
        to: employeeData.email,
        subject: `Update on your leave request: ${afterData.status}`,
        html: leaveUpdateTemplate(employeeData.name, startDate, endDate, afterData.status, afterData.rejectionReason)
    };

    try {
        await transporter.sendMail(employeeMailOptions);
        console.log(`[onLeaveRequestUpdate] Status update email sent to employee: ${employeeData.email}`);
    } catch (error) {
        console.error(
            `[onLeaveRequestUpdate] Failed to send email to ${employeeData.email}. ` +
            `Error code: ${error.code}, message: ${error.message}, ` +
            `SMTP response: ${error.response || 'N/A'}`
        );
    }

    // If escalated to HR, also notify all HR Managers
    if (afterData.status === 'Pending HR Approval' && beforeData.status !== 'Pending HR Approval') {
        try {
            const managerName = afterData.approvedBy || 'Department Manager';
            const hrManagersSnapshot = await db.collection("users")
                .where("role", "in", ["Manager HR", "HR Manager", "Admin"])
                .get();

            for (const hrDoc of hrManagersSnapshot.docs) {
                const hrData = hrDoc.data();
                if (!hrData.email) continue;
                const hrMailOptions = {
                    from: '"HRMS Portal" <hrms@aibs.edu.lk>',
                    to: hrData.email,
                    subject: `Leave Request Escalated: ${employeeData.name} - ${afterData.type}`,
                    html: escalationTemplate(hrData.name || 'HR Manager', employeeData.name, managerName, afterData, startDate, endDate)
                };
                try {
                    await transporter.sendMail(hrMailOptions);
                    console.log(`[onLeaveRequestUpdate] Escalation email sent to HR: ${hrData.email}`);
                } catch (hrEmailError) {
                    console.error(`[onLeaveRequestUpdate] Failed to send escalation email to ${hrData.email}: ${hrEmailError.message}`);
                }
            }
        } catch (hrLookupError) {
            console.error(`[onLeaveRequestUpdate] Failed to lookup HR managers for escalation email: ${hrLookupError.message}`);
        }
    }
});

// SUSPENDED: Performance evaluation reminders temporarily disabled
// exports.sendPerformanceEvaluationReminders = onSchedule({
//     schedule: "0 9 * * *",
//     timeZone: "Asia/Colombo",
//     region: "asia-southeast1"
// }, async (event) => {
//     console.log('[sendPerformanceEvaluationReminders] Starting performance evaluation reminder check...');
//     try {
//         const usersSnapshot = await db.collection('users').where('role', '==', 'Employee').get();
//         const today = new Date();
//         const threeDaysFromNow = new Date(today);
//         threeDaysFromNow.setDate(today.getDate() + 3);
//
//         let reminderCount = 0;
//
//         for (const doc of usersSnapshot.docs) {
//             const userData = doc.data();
//
//             if (userData.nextEvaluationDate) {
//                 const nextEvaluationDate = new Date(userData.nextEvaluationDate);
//
//                 if (nextEvaluationDate.toDateString() === threeDaysFromNow.toDateString()) {
//                     const hrManagersSnapshot = await db.collection('users')
//                         .where('role', '==', 'Manager HR')
//                         .get();
//
//                     for (const hrDoc of hrManagersSnapshot.docs) {
//                         const hrData = hrDoc.data();
//                         await sendEvaluationReminder(userData, 'hr', hrData);
//                     }
//
//                     reminderCount++;
//                 }
//             }
//         }
//
//         console.log(`[sendPerformanceEvaluationReminders] Sent ${reminderCount} performance evaluation reminders`);
//     } catch (error) {
//         console.error('[sendPerformanceEvaluationReminders] Error:', error.message);
//     }
// });

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

// Automated annual leave balance reset on Jan 1st at midnight (Colombo time)
exports.resetAnnualLeaveBalances = onSchedule({
    schedule: "0 0 1 1 *",
    timeZone: "Asia/Colombo",
    region: "asia-southeast1"
}, async (event) => {
    console.log('[resetAnnualLeaveBalances] Starting annual leave balance reset...');
    try {
        const usersSnapshot = await db.collection('users').get();
        const currentYear = new Date().getFullYear();
        const batch = db.batch();
        let resetCount = 0;

        for (const userDoc of usersSnapshot.docs) {
            const user = userDoc.data();
            const joinedDate = user.joinedDate;
            if (!joinedDate) continue;

            // Use stored allocations as the reset target
            const allocations = user.leaveAllocations || {};
            const currentBalances = user.leaveBalance || {};
            const allKeys = [...new Set([...Object.keys(currentBalances), ...Object.keys(allocations)])];

            const resetBalances = {};
            allKeys.forEach((key) => {
                if (key === 'leave in-lieu' || key === 'other' || key === 'shortLeave') {
                    // Preserve accrued/monthly balances
                    resetBalances[key] = currentBalances[key] ?? 0;
                } else {
                    resetBalances[key] = allocations[key] ?? 0;
                }
            });

            const userRef = db.collection('users').doc(userDoc.id);
            batch.update(userRef, {
                leaveBalance: resetBalances,
                annualLeaveLastReset: new Date().toISOString(),
                annualLeaveResetBy: 'Automated System'
            });
            resetCount++;
        }

        await batch.commit();
        console.log(`[resetAnnualLeaveBalances] Successfully reset annual leave balances for ${resetCount} users`);
    } catch (error) {
        console.error('[resetAnnualLeaveBalances] Error:', error.message);
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
        const userRef = db.collection('users').doc(event.params.userId);
        const nextEvaluationDate = new Date();
        nextEvaluationDate.setMonth(nextEvaluationDate.getMonth() + 3);

        await userRef.update({
            nextEvaluationDate: nextEvaluationDate.toISOString(),
            lastEvaluationDate: new Date().toISOString()
        });

        console.log(`[onPerformanceEvaluationComplete] Updated evaluation schedule for user ${afterData.name}`);
    }
});


/**
 * Cloud Function: onUserCreated
 * Safety-net trigger: fires when a new user document is created in Firestore.
 * Calculates and applies leave balances for ALL conditions (A, B, C) if they
 * were not already fully set by the signup() flow (e.g. users created via
 * Admin SDK, scripts, or other paths).
 *
 * Condition A (joined current calendar year):
 *   Annual Leave  = 0 days
 *   Sick Leave    = 7 days
 *   Casual Leave  = 0.5 days × completed months since join date
 *
 * Condition B (joined previous calendar year):
 *   Annual Leave  = based on join quarter (Q1=14, Q2=10, Q3=7, Q4=4)
 *   Sick Leave    = 7 days
 *   Casual Leave  = 7 days
 *
 * Condition C (joined two or more years ago):
 *   Annual Leave  = 14 days
 *   Sick Leave    = 7 days
 *   Casual Leave  = 7 days
 *
 * Short Leave = 3 hours/month for all conditions (monthly reset, not annual)
 */
exports.onUserCreated = onDocumentCreated({
    document: "users/{userId}",
    region: "asia-southeast1"
}, async (event) => {
    const snap = event.data;
    if (!snap) {
        console.log("[onUserCreated] No data associated with the event");
        return;
    }

    const userData = snap.data();
    const userId = event.params.userId;

    // Skip if signup() already set the full leave balance (all three standard
    // fields present means the client-side signup() ran successfully).
    const existingBalance = userData.leaveBalance || {};
    if (
        existingBalance.sickLeave !== undefined &&
        existingBalance.casualLeave !== undefined &&
        existingBalance.annualLeave !== undefined
    ) {
        console.log("[onUserCreated] User " + userId + " already has complete leave balances. Skipping.");
        return;
    }

    const joinedDate = userData.joinedDate;
    if (!joinedDate) {
        console.warn("[onUserCreated] User " + userId + " has no joinedDate. Cannot calculate leave balances.");
        return;
    }

    // --- Inline policy logic (mirrors lib/leavePolicy.js) ---
    // Cannot import the ES-module lib/leavePolicy.js from CommonJS Cloud Functions.

    const SICK_LEAVE_STANDARD       = 7;
    const CASUAL_LEAVE_STANDARD     = 7;
    const ANNUAL_LEAVE_STANDARD     = 14;
    const CASUAL_LEAVE_ACCRUAL_RATE = 0.5; // days per completed month (Condition A)
    const ANNUAL_LEAVE_TIERS        = [14, 10, 7, 4]; // Q1→Q4 (Condition B)
    const SHORT_LEAVE_MONTHLY_LIMIT = 3;   // hours/month (all conditions)

    const parseDate = (val) => {
        if (!val) return null;
        if (val instanceof Date) return val;
        if (typeof val === 'object' && typeof val.toDate === 'function') return val.toDate();
        const str = String(val);
        if (str.match(/^\d{4}-\d{2}-\d{2}$/)) return new Date(str + 'T12:00:00');
        return new Date(val);
    };

    const calculateCompletedMonths = (joinDate, refDate) => {
        const join = parseDate(joinDate);
        const ref  = parseDate(refDate);
        if (!join || !ref || isNaN(join.getTime()) || isNaN(ref.getTime())) return 0;
        let months = (ref.getFullYear() - join.getFullYear()) * 12 + (ref.getMonth() - join.getMonth());
        if (ref.getDate() < join.getDate()) months--;
        return Math.max(0, months);
    };

    const getQuarterlyAnnualLeave = (join) => {
        const quarterIndex = Math.floor(join.getMonth() / 3); // 0–3
        return ANNUAL_LEAVE_TIERS[quarterIndex] || 0;
    };

    const now         = new Date();
    const currentYear = now.getFullYear();
    const join        = parseDate(joinedDate);

    if (!join || isNaN(join.getTime())) {
        console.error("[onUserCreated] Invalid joinedDate for user " + userId + ": " + joinedDate);
        return;
    }

    const joinYear = join.getFullYear();

    // Determine condition
    let condition;
    if (joinYear === currentYear)      condition = 'A';
    else if (joinYear === currentYear - 1) condition = 'B';
    else if (joinYear < currentYear - 1)  condition = 'C';
    else {
        console.warn("[onUserCreated] User " + userId + " has a future join date (" + joinYear + "). Skipping.");
        return;
    }

    // Calculate entitlements per condition
    let annualLeave, sickLeave, casualLeave;

    if (condition === 'A') {
        const completedMonths = calculateCompletedMonths(join, now);
        annualLeave  = 0;
        sickLeave    = SICK_LEAVE_STANDARD;
        casualLeave  = parseFloat((completedMonths * CASUAL_LEAVE_ACCRUAL_RATE).toFixed(2));
        console.log(
            "[onUserCreated] Condition A for user " + userId +
            ": completedMonths=" + completedMonths + ", casualLeave=" + casualLeave
        );
    } else if (condition === 'B') {
        annualLeave  = getQuarterlyAnnualLeave(join);
        sickLeave    = SICK_LEAVE_STANDARD;
        casualLeave  = CASUAL_LEAVE_STANDARD;
        console.log(
            "[onUserCreated] Condition B for user " + userId +
            ": joinMonth=" + (join.getMonth() + 1) + ", annualLeave=" + annualLeave
        );
    } else { // condition === 'C'
        annualLeave  = ANNUAL_LEAVE_STANDARD;
        sickLeave    = SICK_LEAVE_STANDARD;
        casualLeave  = CASUAL_LEAVE_STANDARD;
        console.log("[onUserCreated] Condition C for user " + userId + ": full standard entitlements.");
    }

    const leaveBalance = Object.assign({}, existingBalance, {
        annualLeave:  annualLeave,
        sickLeave:    sickLeave,
        casualLeave:  casualLeave,
        shortLeave:   existingBalance.shortLeave !== undefined
                          ? existingBalance.shortLeave
                          : SHORT_LEAVE_MONTHLY_LIMIT,
    });

    const leaveAllocations = Object.assign({}, userData.leaveAllocations || {}, {
        annualLeave:  annualLeave,
        sickLeave:    sickLeave,
        casualLeave:  casualLeave,
        // shortLeave intentionally omitted — resets monthly, no annual allocation
    });

    try {
        await snap.ref.update({
            leaveBalance:          leaveBalance,
            leaveAllocations:      leaveAllocations,
            leaveCondition:        condition,
            leaveConditionSetAt:   now.toISOString(),
            leaveConditionSetBy:   'Automated System (Condition ' + condition + ')',
        });
        console.log(
            "[onUserCreated] Condition " + condition + " balances applied for user " + userId +
            ": Annual=" + annualLeave + ", Sick=" + sickLeave + ", Casual=" + casualLeave
        );
    } catch (error) {
        console.error("[onUserCreated] Failed to set leave balances for user " + userId + ": " + error.message);
    }
});
