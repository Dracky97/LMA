import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getFirestore, collection, onSnapshot, doc, updateDoc, getDoc } from 'firebase/firestore';
import { app } from '../../lib/firebase-client';
import ManagerRequestsTable from '../ManagerRequestsTable';
import LeaveHistoryTable from '../LeaveHistoryTable';

const db = getFirestore(app);

export default function HRManagerDashboard() {
    const { userData } = useAuth();
    const [allRequests, setAllRequests] = useState([]);
    const [users, setUsers] = useState({});
    const [message, setMessage] = useState(null);

    useEffect(() => {
        const usersUnsubscribe = onSnapshot(collection(db, 'users'), (snapshot) => {
            const usersData = {};
            snapshot.forEach(doc => usersData[doc.id] = doc.data());
            setUsers(usersData);
        });

        const requestsUnsubscribe = onSnapshot(collection(db, "leaveRequests"), (snapshot) => {
            const requests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            requests.sort((a, b) => {
                // Handle case where appliedOn might be undefined
                if (!a.appliedOn || !b.appliedOn) return 0;
                return b.appliedOn.toDate() - a.appliedOn.toDate();
            });
            setAllRequests(requests);
        }, (error) => {
            console.error("Error fetching leave requests:", error);
        });

        return () => {
            usersUnsubscribe();
            requestsUnsubscribe();
        };
    }, []);

    const handleFinalApproval = async (requestId, newStatus) => {
        try {
            // Clear any previous messages
            setMessage(null);
            
            const requestRef = doc(db, "leaveRequests", requestId);
            const request = allRequests.find(r => r.id === requestId);
            if (!request) {
                throw new Error('Request not found');
            }

            if (newStatus === 'Approved') {
                await updateDoc(requestRef, {
                    hrManagerApproval: 'Approved',
                    status: 'Approved',
                    hrManagerActionBy: userData.name
                });

                // Validate request data
                if (!request.userId || !request.type || !request.startDate || !request.endDate) {
                    throw new Error('Invalid request data');
                }

                const userRef = doc(db, "users", request.userId);
                const userDoc = await getDoc(userRef);
                if (userDoc.exists()) {
                    const currentData = userDoc.data();
                    const leaveType = request.type.toLowerCase();
                    
                    // Validate leave type exists in user's balance
                    if (!currentData.leaveBalance.hasOwnProperty(leaveType)) {
                        throw new Error(`Invalid leave type: ${request.type}`);
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
            } else {
                await updateDoc(requestRef, {
                    hrManagerApproval: 'Rejected',
                    status: 'Rejected',
                    hrManagerActionBy: userData.name
                });
            }
            
            setMessage({ type: 'success', text: `Leave request ${newStatus.toLowerCase()} successfully.` });
        } catch (error) {
            console.error("Error handling final approval:", error);
            setMessage({ type: 'error', text: `Error ${newStatus.toLowerCase()}ing leave request: ${error.message}` });
        }
    };

    const pendingHRRequests = allRequests.filter(r => r.status === 'Pending HR Approval');

    return (
        <div className="space-y-8">
            <div className="bg-card p-6 rounded-lg shadow-sm">
                {message && (
                    <div className={`mb-4 p-3 rounded-md ${message.type === 'success' ? 'bg-green-900/30 text-green-300' : 'bg-red-900/30 text-red-300'}`}>
                        {message.text}
                    </div>
                )}
                <h2 className="text-xl font-semibold text-slate-200 mb-4">Requests for Final Approval ({pendingHRRequests.length})</h2>
                <ManagerRequestsTable requests={pendingHRRequests} users={users} onUpdate={handleFinalApproval} />
            </div>
            <div className="bg-card p-6 rounded-lg shadow-sm">
                <h2 className="text-xl font-semibold text-slate-200 mb-4">Company-wide Leave History</h2>
                <LeaveHistoryTable requests={allRequests} users={users} isAdminView={true} />
            </div>
        </div>
    );
};
