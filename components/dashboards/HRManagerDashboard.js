import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getFirestore, collection, onSnapshot, doc, updateDoc, getDoc } from 'firebase/firestore';
import { app } from '../../lib/firebase-client';
import ManagerRequestsTable from '../ManagerRequestsTable';
import LeaveHistoryTable from '../LeaveHistoryTable';
import LeaveRequestModal from '../LeaveRequestModal';
import MyLeaveSection from '../MyLeaveSection';
import { LEAVE_TYPE_MAP, validateLeaveType } from '../../lib/leaveTypes';

const db = getFirestore(app);

// Leave type mapping is now imported from shared configuration

export default function HRManagerDashboard() {
    const { userData } = useAuth();
    const [allRequests, setAllRequests] = useState([]);
    const [users, setUsers] = useState({});
    const [message, setMessage] = useState(null);
    const [activeTab, setActiveTab] = useState('requests');
    const [showLeaveModal, setShowLeaveModal] = useState(false);

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

    const handleFinalApproval = async (requestId, newStatus, rejectionReason = '') => {
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
                    hrManagerActionBy: userData.name,
                    rejectionReason: ''
                });

                // Validate request data
                if (!request.userId || !request.type || !request.startDate || !request.endDate) {
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
                    
                    // Use leaveUnits if available (for half-day support), otherwise calculate from dates
                    let duration;
                    if (request.leaveUnits !== undefined && request.leaveUnits > 0) {
                        duration = request.leaveUnits;
                    } else {
                        // Fallback to date calculation for older requests
                        duration = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
                    }
                    
                    console.log('HR Manager deducting leave:', {
                        leaveType,
                        duration,
                        leaveUnits: request.leaveUnits,
                        currentBalance,
                        isPartialDay: request.isPartialDay
                    });
                    
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
                    hrManagerActionBy: userData.name,
                    rejectionReason: rejectionReason?.trim() || ''
                });
            }
            
            setMessage({ type: 'success', text: `Leave request ${newStatus.toLowerCase()} successfully.` });
        } catch (error) {
            console.error("Error handling final approval:", error);
            setMessage({ type: 'error', text: `Error ${newStatus.toLowerCase()}ing leave request: ${error.message}` });
        }
    };

    const pendingHRRequests = allRequests.filter(r => r.status === 'Pending HR Approval');

    // Function to format leave balance display
    const formatLeaveBalance = (balance) => {
        if (balance === undefined || balance === null) return '0';
        // Show decimals only if needed (e.g., 7.5 instead of 7.50, but 7 instead of 7.0)
        return balance % 1 === 0 ? balance.toString() : balance.toFixed(1);
    };

    return (
        <div className="space-y-6">
            {/* My Leave Section */}
            <div className="border-b pb-8 mb-8 border-gray-700">
                <MyLeaveSection />
            </div>
            
            {message && (
                <div className={`p-3 rounded-md ${message.type === 'success' ? 'bg-green-900/30 text-green-300' : 'bg-red-900/30 text-red-300'}`}>
                    {message.text}
                </div>
            )}
            
            {/* Tab Navigation */}
            <div className="border-b border-gray-700">
                <nav className="-mb-px flex space-x-8">
                    <button
                        onClick={() => setActiveTab('requests')}
                        className={`py-4 px-1 border-b-2 font-medium text-sm ${
                            activeTab === 'requests'
                                ? 'border-blue-500 text-blue-400'
                                : 'border-transparent text-slate-500 hover:text-slate-300 hover:border-slate-300'
                        }`}
                    >
                        Requests for Final Approval ({pendingHRRequests.length})
                    </button>
                    <button
                        onClick={() => setActiveTab('balances')}
                        className={`py-4 px-1 border-b-2 font-medium text-sm ${
                            activeTab === 'balances'
                                ? 'border-blue-500 text-blue-400'
                                : 'border-transparent text-slate-500 hover:text-slate-300 hover:border-slate-300'
                        }`}
                    >
                        All Users Leave Balances
                    </button>
                    <button
                        onClick={() => setActiveTab('history')}
                        className={`py-4 px-1 border-b-2 font-medium text-sm ${
                            activeTab === 'history'
                                ? 'border-blue-500 text-blue-400'
                                : 'border-transparent text-slate-500 hover:text-slate-300 hover:border-slate-300'
                        }`}
                    >
                        Company-wide Leave History
                    </button>
                </nav>
            </div>
            
            {/* Apply for Leave Button */}
            <div className="flex justify-end">
                <button
                    onClick={() => setShowLeaveModal(true)}
                    className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                >
                    Apply for Leave
                </button>
            </div>
            
            {/* Tab Content */}
            <div className="bg-card rounded-lg shadow-sm">
                {activeTab === 'requests' && (
                    <div className="p-6">
                        <ManagerRequestsTable requests={pendingHRRequests} users={users} onUpdate={handleFinalApproval} />
                    </div>
                )}
                
                {activeTab === 'balances' && (
                    <div className="p-6">
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-700">
                                <thead className="bg-muted">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Employee</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Department</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Annual Leave</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Sick Leave</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Casual Leave</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Maternity Leave</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Paternity Leave</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Leave in-lieu</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Short Leave</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Other</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-card divide-y divide-gray-700">
                                    {Object.values(users).map(user => (
                                        <tr key={user.uid || user.id}>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-200">{user.name}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400">{user.department || 'N/A'}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400">{formatLeaveBalance(user.leaveBalance?.annualLeave)}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400">{formatLeaveBalance(user.leaveBalance?.sickLeave)}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400">{formatLeaveBalance(user.leaveBalance?.casualLeave)}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400">{formatLeaveBalance(user.leaveBalance?.maternityLeave)}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400">{formatLeaveBalance(user.leaveBalance?.paternityLeave)}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400">{formatLeaveBalance(user.leaveBalance?.['leave in-lieu'])}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400">{formatLeaveBalance(user.leaveBalance?.shortLeave)}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400">{formatLeaveBalance(user.leaveBalance?.other)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
                
                {activeTab === 'history' && (
                    <div className="p-6">
                        <LeaveHistoryTable requests={allRequests} users={users} isAdminView={true} />
                    </div>
                )}
            </div>
            
            {/* Leave Request Modal */}
            {showLeaveModal && (
                <LeaveRequestModal
                    userData={userData}
                    onClose={() => setShowLeaveModal(false)}
                />
            )}
        </div>
    );
};
