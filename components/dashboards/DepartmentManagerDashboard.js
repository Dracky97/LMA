import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getFirestore, collection, query, where, onSnapshot, doc, updateDoc, getDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { app } from '../../lib/firebase-client';
import ManagerRequestsTable from '../ManagerRequestsTable';
import LeaveHistoryTable from '../LeaveHistoryTable';
import MyLeaveSection from '../MyLeaveSection';
import { LEAVE_TYPE_MAP, validateLeaveType } from '../../lib/leaveTypes';
import { LEAVE_CONFIG } from '../../lib/leavePolicy';

const db = getFirestore(app);

export default function DepartmentManagerDashboard() {
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

    const sendNotification = async (recipientId, type, title, message) => {
        try {
            await addDoc(collection(db, 'notifications'), {
                recipientId,
                type,
                title,
                message,
                read: false,
                createdAt: serverTimestamp(),
            });
        } catch (e) {
            console.warn('Could not send notification:', e.message);
        }
    };

    const handleApproval = async (requestId, newStatus, rejectionReason = '') => {
        try {
            setMessage(null);

            const requestRef = doc(db, "leaveRequests", requestId);
            const requestDoc = await getDoc(requestRef);
            const request = requestDoc.data();

            if (!request) throw new Error('Request not found');

            const isUnpaidLeave = request.type === 'Unpaid Leave';
            const isLeaveInLieu = request.type === 'Leave in-lieu';

            if (newStatus === 'Approved') {
                if (isUnpaidLeave) {
                    await updateDoc(requestRef, {
                        status: 'Pending HR Approval',
                        approvedBy: userData.name,
                        managerApprovalDate: new Date().toISOString(),
                        rejectionReason: ''
                    });
                    await sendNotification(
                        request.userId,
                        'leave_escalated',
                        'Leave Sent to HR',
                        `Your ${request.type} request has been forwarded to HR for final approval.`
                    );
                    setMessage({ type: 'success', text: 'Unpaid leave request escalated to HR for final approval.' });
                } else if (isLeaveInLieu) {
                    // Leave in-lieu is accrued rather than allocated, so manager
                    // approval is final and must not be escalated for a zero balance.
                    await updateDoc(requestRef, {
                        status: 'Approved',
                        approvedBy: userData.name,
                        approvalDate: new Date().toISOString(),
                        rejectionReason: ''
                    });
                    await deductLeaveBalance(request);
                    await sendNotification(
                        request.userId,
                        'leave_approved',
                        'Leave Request Approved',
                        'Your Leave in-lieu request has been approved by your manager.'
                    );
                    setMessage({ type: 'success', text: 'Leave in-lieu request approved successfully.' });
                } else {
                    const wouldGoNegative = await checkIfRequestWouldGoNegative(request);

                    if (wouldGoNegative) {
                        await updateDoc(requestRef, {
                            status: 'Pending HR Approval',
                            approvedBy: userData.name,
                            managerApprovalDate: new Date().toISOString(),
                            rejectionReason: ''
                        });
                        await sendNotification(
                            request.userId,
                            'leave_escalated',
                            'Leave Sent to HR',
                            `Your ${request.type} request has been forwarded to HR for final approval (insufficient balance).`
                        );
                        setMessage({ type: 'success', text: 'Request escalated to HR for final approval due to insufficient leave balance.' });
                    } else {
                        await updateDoc(requestRef, {
                            status: 'Approved',
                            approvedBy: userData.name,
                            approvalDate: new Date().toISOString(),
                            rejectionReason: ''
                        });
                        await deductLeaveBalance(request);
                        await sendNotification(
                            request.userId,
                            'leave_approved',
                            'Leave Request Approved',
                            `Your ${request.type} request has been approved by your manager.`
                        );
                        setMessage({ type: 'success', text: 'Leave request approved successfully.' });
                    }
                }
            } else {
                await updateDoc(requestRef, {
                    status: newStatus,
                    approvedBy: userData.name,
                    rejectionReason: newStatus === 'Rejected' ? (rejectionReason?.trim() || '') : '',
                    rejectionDate: newStatus === 'Rejected' ? new Date().toISOString() : null
                });
                if (newStatus === 'Rejected') {
                    await sendNotification(
                        request.userId,
                        'leave_rejected',
                        'Leave Request Rejected',
                        `Your ${request.type} request was rejected.${rejectionReason ? ` Reason: ${rejectionReason}` : ''}`
                    );
                }
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
            const leaveType = LEAVE_TYPE_MAP[request.type] || request.type.toLowerCase().replace(/\s+/g, '');

            if (!currentData.leaveBalance || !currentData.leaveBalance.hasOwnProperty(leaveType)) {
                return true; // No balance means it would go negative
            }

            const currentBalance = currentData.leaveBalance[leaveType];

            // Use leaveUnits if available, otherwise calculate from dates
            const duration = request.leaveUnits !== undefined && request.leaveUnits > 0
                ? request.leaveUnits
                : Math.ceil((request.endDate.toDate() - request.startDate.toDate()) / (1000 * 60 * 60 * 24));

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
            const leaveType = LEAVE_TYPE_MAP[request.type] || request.type.toLowerCase().replace(/\s+/g, '');

            if (!currentData.leaveBalance) {
                currentData.leaveBalance = {};
            }

            // Use leaveUnits if available, otherwise calculate from dates
            // Special handling for Short Leave - deduct hours instead of days
            let duration;
            if (request.type === 'Short Leave') {
                duration = request.totalHours || 0;
            } else {
                duration = request.leaveUnits !== undefined && request.leaveUnits > 0
                    ? request.leaveUnits
                    : Math.ceil((request.endDate.toDate() - request.startDate.toDate()) / (1000 * 60 * 60 * 24));
            }

            // Handle cross-utilization for Annual and Casual leave
            const updatedLeaveBalance = { ...currentData.leaveBalance };
            
            if (leaveType === 'annualLeave' || leaveType === 'casualLeave') {
                const primaryType = leaveType;
                const fallbackType = leaveType === 'annualLeave' ? 'casualLeave' : 'annualLeave';
                
                // Initialize balances if they don't exist
                if (!updatedLeaveBalance[primaryType]) updatedLeaveBalance[primaryType] = 0;
                if (!updatedLeaveBalance[fallbackType]) updatedLeaveBalance[fallbackType] = 0;
                
                const primaryBalance = updatedLeaveBalance[primaryType];
                const fallbackBalance = updatedLeaveBalance[fallbackType];
                
                if (primaryBalance >= duration) {
                    // Sufficient balance in primary leave type
                    updatedLeaveBalance[primaryType] = primaryBalance - duration;
                } else if (primaryBalance + fallbackBalance >= duration) {
                    // Cross-utilization needed
                    const remaining = duration - primaryBalance;
                    updatedLeaveBalance[primaryType] = 0;
                    updatedLeaveBalance[fallbackType] = fallbackBalance - remaining;
                    

                } else {
                    // Insufficient total balance - will go negative
                    updatedLeaveBalance[primaryType] = primaryBalance - duration;
                }
            } else {
                // Initialize leave type if needed
                if (!updatedLeaveBalance[leaveType]) {
                    // Special initialization for Short Leave - start with monthly limit
                    updatedLeaveBalance[leaveType] = leaveType === 'shortLeave' ? LEAVE_CONFIG.SHORT_LEAVE_MONTHLY_LIMIT : 0;
                }
                // Leave in-lieu is an accrual type: approval earns units.
                updatedLeaveBalance[leaveType] = leaveType === 'leave in-lieu'
                    ? updatedLeaveBalance[leaveType] + duration
                    : updatedLeaveBalance[leaveType] - duration;
            }

            // Check if any leave balance is going negative and update noPay status
            const hasNegativeBalance = Object.values(updatedLeaveBalance).some(balance => balance < 0);
            const currentlyOnNoPay = currentData.noPayStatus || false;

            // Update noPay status if transitioning to/from negative balance
            if (hasNegativeBalance && !currentlyOnNoPay) {
                // Starting no pay period
                await updateDoc(userRef, {
                    leaveBalance: updatedLeaveBalance,
                    noPayStatus: true,
                    noPayStartDate: new Date().toISOString()
                });
            } else if (!hasNegativeBalance && currentlyOnNoPay) {
                // Ending no pay period
                await updateDoc(userRef, {
                    leaveBalance: updatedLeaveBalance,
                    noPayStatus: false,
                    noPayEndDate: new Date().toISOString()
                });
            } else {
                // No status change needed
                await updateDoc(userRef, {
                    leaveBalance: updatedLeaveBalance
                });
            }
        } catch (error) {
            console.error("Error deducting leave balance:", error);
            throw error;
        }
    };

    const pendingRequests = teamRequests.filter(r => r.status === 'Pending');
    
    return (
        <div className="space-y-8">
            <div className="border-b pb-8 mb-8 border-gray-700">
              <MyLeaveSection />
            </div>

            <div className="bg-card p-6 rounded-lg shadow-sm">
                {message && (
                    <div className={`mb-4 p-3 rounded-md ${message.type === 'success' ? 'bg-green-900/30 text-green-300' : 'bg-red-900/30 text-red-300'}`}>
                        {message.text}
                    </div>
                )}
                <h2 className="text-xl font-semibold text-slate-200 mb-4">Team Requests for Your Approval ({pendingRequests.length})</h2>
                <ManagerRequestsTable requests={pendingRequests} users={users} onUpdate={handleApproval} isHRView={false} />
            </div>
            <div className="bg-card p-6 rounded-lg shadow-sm">
                <h2 className="text-xl font-semibold text-slate-200 mb-4">Team Leave History</h2>
                <LeaveHistoryTable requests={teamRequests} users={users} isAdminView={true} />
            </div>
        </div>
    );
};
