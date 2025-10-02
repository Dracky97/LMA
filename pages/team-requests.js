import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { getFirestore, collection, query, where, onSnapshot, doc, updateDoc, getDoc } from 'firebase/firestore';
import { app } from '../lib/firebase-client';
import DashboardLayout from '../components/DashboardLayout';
import ManagerRequestsTable from '../components/ManagerRequestsTable';
import LeaveHistoryTable from '../components/LeaveHistoryTable';
import { LEAVE_TYPE_MAP, validateLeaveType } from '../lib/leaveTypes';

const db = getFirestore(app);

export default function TeamRequestsPage() {
    const { userData } = useAuth();
    const [teamRequests, setTeamRequests] = useState([]);
    const [users, setUsers] = useState({});
    const [message, setMessage] = useState(null);

    useEffect(() => {
        if (!userData?.uid) return;

        const usersUnsubscribe = onSnapshot(collection(db, 'users'), (snapshot) => {
            const usersData = {};
            snapshot.forEach(doc => usersData[doc.id] = doc.data());
            setUsers(usersData);
        });

        const q = query(collection(db, "leaveRequests"), where("managerId", "==", userData.uid));
        const requestsUnsubscribe = onSnapshot(q, (snapshot) => {
            const requests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            requests.sort((a, b) => {
                // Handle case where appliedOn might be undefined
                if (!a.appliedOn || !b.appliedOn) return 0;
                return b.appliedOn.toDate() - a.appliedOn.toDate();
            });
            setTeamRequests(requests);
        }, (error) => {
            console.error("Error fetching leave requests:", error);
        });

        return () => {
            usersUnsubscribe();
            requestsUnsubscribe();
        };
    }, [userData?.uid]);

    const handleApproval = async (requestId, newStatus) => {
        try {
            // Clear any previous messages
            setMessage(null);

            const requestRef = doc(db, "leaveRequests", requestId);
            const requestDoc = await getDoc(requestRef);
            const request = requestDoc.data();

            if (!request) {
                throw new Error('Request not found');
            }

            // Check if this approval would result in negative balance
            const wouldGoNegative = await checkIfRequestWouldGoNegative(request);

            if (newStatus === 'Approved' && wouldGoNegative) {
                // Request would go negative - escalate to HR for approval
                await updateDoc(requestRef, {
                    status: 'Pending HR Approval',
                    approvedBy: userData.name,
                    managerApprovalDate: new Date().toISOString()
                });
                setMessage({ type: 'success', text: 'Request escalated to HR for final approval due to insufficient leave balance.' });
            } else if (newStatus === 'Approved' && !wouldGoNegative) {
                // Regular approval - deduct balance immediately
                await updateDoc(requestRef, {
                    status: 'Approved',
                    approvedBy: userData.name,
                    approvalDate: new Date().toISOString()
                });

                await deductLeaveBalance(request);
                setMessage({ type: 'success', text: 'Leave request approved successfully.' });
            } else {
                // Rejection or other status changes
                await updateDoc(requestRef, {
                    status: newStatus,
                    approvedBy: userData.name,
                    rejectionDate: newStatus === 'Rejected' ? new Date().toISOString() : null
                });
                setMessage({ type: 'success', text: `Leave request ${newStatus.toLowerCase()} successfully.` });
            }
        } catch (error) {
            console.error("Error handling approval:", error);
            setMessage({ type: 'error', text: `Error ${newStatus.toLowerCase()}ing leave request: ${error.message}` });
        }
    };

    const checkIfRequestWouldGoNegative = async (request) => {
        try {
            const userRef = doc(db, "users", request.userId);
            const userDoc = await getDoc(userRef);

            if (!userDoc.exists()) {
                throw new Error('User not found');
            }

            const currentData = userDoc.data();
            const leaveType = LEAVE_TYPE_MAP[request.type] || request.type.toLowerCase().replace(' ', '');

            if (!currentData.leaveBalance || !currentData.leaveBalance.hasOwnProperty(leaveType)) {
                return true; // No balance means it would go negative
            }

            const currentBalance = currentData.leaveBalance[leaveType];
            const startDate = request.startDate.toDate();
            const endDate = request.endDate.toDate();

            if (isNaN(startDate.getTime()) || isNaN(endDate.getTime()) || endDate < startDate) {
                throw new Error('Invalid date range');
            }

            // Use leaveUnits if available, otherwise calculate from dates
            const duration = request.leaveUnits !== undefined && request.leaveUnits > 0
                ? request.leaveUnits
                : Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));

            return (currentBalance - duration) < 0;
        } catch (error) {
            console.error("Error checking negative balance:", error);
            return true; // Default to requiring HR approval on error
        }
    };

    const deductLeaveBalance = async (request) => {
        try {
            const userRef = doc(db, "users", request.userId);
            const userDoc = await getDoc(userRef);

            if (!userDoc.exists()) {
                throw new Error('User not found');
            }

            const currentData = userDoc.data();
            const leaveType = LEAVE_TYPE_MAP[request.type] || request.type.toLowerCase().replace(' ', '');

            if (!currentData.leaveBalance) {
                currentData.leaveBalance = {};
            }

            // Initialize missing leave type if needed
            if (!currentData.leaveBalance.hasOwnProperty(leaveType)) {
                currentData.leaveBalance[leaveType] = 0;
            }

            const currentBalance = currentData.leaveBalance[leaveType];

            // Use leaveUnits if available, otherwise calculate from dates
            const duration = request.leaveUnits !== undefined && request.leaveUnits > 0
                ? request.leaveUnits
                : Math.ceil((request.endDate.toDate() - request.startDate.toDate()) / (1000 * 60 * 60 * 24));

            const newBalance = currentBalance - duration;

            // Check if any leave balance is going negative and update noPay status
            const updatedLeaveBalance = { ...currentData.leaveBalance, [leaveType]: newBalance };
            const hasNegativeBalance = Object.values(updatedLeaveBalance).some(balance => balance < 0);
            const currentlyOnNoPay = currentData.noPayStatus || false;

            // Update noPay status if transitioning to/from negative balance
            if (hasNegativeBalance && !currentlyOnNoPay) {
                // Starting no pay period
                await updateDoc(userRef, {
                    [`leaveBalance.${leaveType}`]: newBalance,
                    noPayStatus: true,
                    noPayStartDate: new Date().toISOString()
                });
            } else if (!hasNegativeBalance && currentlyOnNoPay) {
                // Ending no pay period
                await updateDoc(userRef, {
                    [`leaveBalance.${leaveType}`]: newBalance,
                    noPayStatus: false,
                    noPayEndDate: new Date().toISOString()
                });
            } else {
                // No status change needed
                await updateDoc(userRef, {
                    [`leaveBalance.${leaveType}`]: newBalance
                });
            }
        } catch (error) {
            console.error("Error deducting leave balance:", error);
            throw error;
        }
    };

    const pendingRequests = teamRequests.filter(r => r.status === 'Pending');
    
    return (
        <DashboardLayout>
            <div className="space-y-8">
                <div className="bg-card p-6 rounded-lg shadow-sm">
                    {message && (
                        <div className={`mb-4 p-3 rounded-md ${message.type === 'success' ? 'bg-green-900/30 text-green-300' : 'bg-red-900/30 text-red-300'}`}>
                            {message.text}
                        </div>
                    )}
                    <h2 className="text-xl font-semibold text-slate-200 mb-4">Team Requests for Approval ({pendingRequests.length})</h2>
                    <ManagerRequestsTable requests={pendingRequests} users={users} onUpdate={handleApproval} isHRView={false} />
                </div>
                <div className="bg-card p-6 rounded-lg shadow-sm">
                    <h2 className="text-xl font-semibold text-slate-200 mb-4">Team Leave History</h2>
                    <LeaveHistoryTable requests={teamRequests} users={users} isAdminView={true} />
                </div>
            </div>
        </DashboardLayout>
    );
};
