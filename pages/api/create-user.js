import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { LEAVE_CONFIG, calculateLeaveEntitlements } from '../../lib/leavePolicy';

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

    const {
        name, email, password, department, managerId,
        employeeNumber, gender, designation, birthday,
        employeeStatus, joinedDate, role
    } = req.body;

    if (!name || !email || !password) {
        return res.status(400).json({ error: 'name, email, and password are required' });
    }

    try {
        initAdmin();
        const adminAuth = getAuth();
        const adminDb = getFirestore();

        const userRecord = await adminAuth.createUser({ email, password, displayName: name });

        const currentDate = new Date();
        const evaluationStartDate = joinedDate ? new Date(joinedDate) : currentDate;
        const evaluationDate = new Date(evaluationStartDate);
        evaluationDate.setMonth(evaluationDate.getMonth() + 3);

        const effectiveJoinDate = joinedDate || currentDate.toISOString();
        let entitlements;
        try {
            entitlements = calculateLeaveEntitlements(effectiveJoinDate, currentDate.getFullYear());
        } catch {
            entitlements = {
                annualLeave: 0,
                sickLeave: LEAVE_CONFIG.SICK_LEAVE_STANDARD,
                casualLeave: 0,
                condition: 'A',
            };
        }

        const leaveBalance = {
            annualLeave: entitlements.annualLeave,
            sickLeave: entitlements.sickLeave,
            casualLeave: entitlements.casualLeave,
            shortLeave: LEAVE_CONFIG.SHORT_LEAVE_MONTHLY_LIMIT,
        };
        const leaveAllocations = {
            annualLeave: entitlements.annualLeave,
            sickLeave: entitlements.sickLeave,
            casualLeave: entitlements.casualLeave,
        };

        const assignedRole = role || 'Employee';
        const managerRoles = [
            'Admin', 'Manager HR', 'HR Manager', 'CEO', 'CMO', 'CFO', 'COO',
            'Registrar', 'Head of Academic', 'Head - Student Support', 'Manager IT',
            'Finance Manager', 'Manager - Marketing & Student Enrolment',
            'Manager - Digital Marketing', 'Sales Manager', 'Academic - Senior Lecturer'
        ];
        const isManagerRole = managerRoles.some(r =>
            assignedRole === r || assignedRole.startsWith('Manager') || assignedRole.startsWith('Head')
        );

        await adminDb.collection('users').doc(userRecord.uid).set({
            name,
            email,
            role: assignedRole,
            isManager: isManagerRole,
            department: department || null,
            managerId: managerId || null,
            employeeNumber: employeeNumber || null,
            gender: gender || null,
            designation: designation || null,
            employeeStatus: employeeStatus || 'probation',
            joinedDate: joinedDate || currentDate.toISOString(),
            nextEvaluationDate: evaluationDate.toISOString(),
            personalDetails: { phone: '', address: '', dob: birthday || '' },
            education: [],
            qualifications: [],
            socialMedia: { linkedin: '', twitter: '' },
            leaveBalance,
            leaveAllocations,
            leaveCondition: entitlements.condition || 'A',
            leaveConditionSetAt: currentDate.toISOString(),
            leaveConditionSetBy: 'Automated System (Condition ' + (entitlements.condition || 'A') + ')',
            createdAt: currentDate,
        });

        return res.status(200).json({ success: true, uid: userRecord.uid });
    } catch (error) {
        console.error('[create-user] Error:', error);
        return res.status(500).json({ error: error.message });
    }
}
