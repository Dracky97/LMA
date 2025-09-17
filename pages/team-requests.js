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
            await updateDoc(requestRef, {
                status: newStatus,
                approvedBy: userData.name
            });

            if (newStatus === 'Approved') {
                const requestDoc = await getDoc(requestRef);
                const request = requestDoc.data();
                
                // Validate request data
                if (!request || !request.userId || !request.type || !request.startDate || !request.endDate) {
                    throw new Error('Invalid request data');
                }
                
                const userRef = doc(db, "users", request.userId);
                const userDoc = await getDoc(userRef);
                if (userDoc.exists()) {
                    const currentData = userDoc.data();
                    // Convert leave type name to match the balance structure
                    const leaveType = LEAVE_TYPE_MAP[request.type] || request.type.toLowerCase().replace(' ', '');

                    // Validate leave type using shared function
                    validateLeaveType(leaveType, currentData.gender);

                    // Debug: Log available leave balance keys
                    console.log('User leave balance keys:', Object.keys(currentData.leaveBalance || {}));
                    console.log('Looking for leave type:', leaveType);
                    console.log('Request type:', request.type);

                    // Validate leave type exists in user's balance, if not initialize it to 0
                    if (!currentData.leaveBalance || !currentData.leaveBalance.hasOwnProperty(leaveType)) {
                        // Initialize missing leave type to 0
                        if (!currentData.leaveBalance) {
                            currentData.leaveBalance = {};
                        }
                        currentData.leaveBalance[leaveType] = 0;
                        
                        // Update user document with the missing leave type
                        await updateDoc(userRef, {
                            [`leaveBalance.${leaveType}`]: 0
                        });
                    }
                    
                    const currentBalance = currentData.leaveBalance[leaveType];
                    const startDate = request.startDate.toDate();
                    const endDate = request.endDate.toDate();
                    
                    // Validate dates
                    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime()) || endDate < startDate) {
                        throw new Error('Invalid date range');
                    }
                    
                    const duration = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
                    
                    // Check if user has enough leave balance
                    if (currentBalance < duration) {
                        throw new Error('Insufficient leave balance');
                    }
                    
                    await updateDoc(userRef, {
                        [`leaveBalance.${leaveType}`]: currentBalance - duration
                    });
                }
            }
            
            setMessage({ type: 'success', text: `Leave request ${newStatus.toLowerCase()} successfully.` });
        } catch (error) {
            console.error("Error handling approval:", error);
            setMessage({ type: 'error', text: `Error ${newStatus.toLowerCase()}ing leave request: ${error.message}` });
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
                    <ManagerRequestsTable requests={pendingRequests} users={users} onUpdate={handleApproval} />
                </div>
                <div className="bg-card p-6 rounded-lg shadow-sm">
                    <h2 className="text-xl font-semibold text-slate-200 mb-4">Team Leave History</h2>
                    <LeaveHistoryTable requests={teamRequests} users={users} isAdminView={true} />
                </div>
            </div>
        </DashboardLayout>
    );
};
