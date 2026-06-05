import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { getFirestore, collection, query, where, onSnapshot, doc, updateDoc, getDoc } from 'firebase/firestore';
import { app } from '../lib/firebase-client';
import { LEAVE_CONFIG, getCurrentMonthShortLeaveUsage } from '../lib/leavePolicy';
import { LEAVE_TYPE_MAP } from '../lib/leaveTypes';
import LeaveBalanceCard from './LeaveBalanceCard';
import LeaveHistoryTable from './LeaveHistoryTable';
import LeaveRequestModal from './LeaveRequestModal';

const db = getFirestore(app);

export default function MyLeaveSection() {
  const { userData } = useAuth();
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [cancelError, setCancelError] = useState('');
  const [cancelSuccess, setCancelSuccess] = useState('');

  useEffect(() => {
    if (!userData?.uid) return;

    const q = query(collection(db, "leaveRequests"), where("userId", "==", userData.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
        const currentYear = new Date().getFullYear();
        const requests = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(request => {
                // Filter to show only current year's leave requests (Jan 1 - Dec 31)
                if (!request.startDate) return false;
                
                try {
                  // Handle both Firestore Timestamp and string dates
                  let startDate;
                  if (request.startDate.toDate) {
                    startDate = request.startDate.toDate();
                  } else {
                    startDate = new Date(request.startDate);
                  }
                  return startDate.getFullYear() === currentYear;
                } catch (error) {
                  console.error("Error parsing startDate for request", request.id, error);
                  return false;
                }
            })
            .sort((a, b) => {
                // Handle case where appliedOn might be undefined
                if (!a.appliedOn || !b.appliedOn) return 0;
                return b.appliedOn.toDate() - a.appliedOn.toDate();
            });
        setLeaveRequests(requests);
    }, (error) => {
        console.error("Error fetching leave requests:", error);
    });
    return () => unsubscribe();
  }, [userData?.uid]);

  const handleCancelRequest = async (request) => {
    if (!window.confirm(`Cancel your ${request.type} request? This cannot be undone.`)) return;
    setCancelError('');
    setCancelSuccess('');
    try {
      const requestRef = doc(db, 'leaveRequests', request.id);
      await updateDoc(requestRef, {
        status: 'Cancelled',
        cancelledBy: userData.name,
        cancellationDate: new Date().toISOString()
      });

      if (request.status === 'Approved') {
        const userRef = doc(db, 'users', userData.uid);
        const userDoc = await getDoc(userRef);
        if (userDoc.exists()) {
          const currentData = userDoc.data();
          const leaveType = LEAVE_TYPE_MAP[request.type] || request.type.toLowerCase().replace(/\s+/g, '');
          const currentBalance = currentData.leaveBalance?.[leaveType] ?? 0;

          let duration;
          if (request.type === 'Short Leave') {
            duration = parseFloat(request.totalHours) || 0;
          } else {
            duration = request.leaveUnits !== undefined && request.leaveUnits > 0
              ? request.leaveUnits
              : Math.ceil((request.endDate.toDate() - request.startDate.toDate()) / (1000 * 60 * 60 * 24));
          }

          const isAccruingType = leaveType === 'leave in-lieu' || leaveType === 'other';
          const newBalance = isAccruingType ? currentBalance - duration : currentBalance + duration;

          await updateDoc(userRef, { [`leaveBalance.${leaveType}`]: newBalance });
        }
      }

      setCancelSuccess('Leave request cancelled successfully.');
      setTimeout(() => setCancelSuccess(''), 4000);
    } catch (error) {
      console.error('Error cancelling leave request:', error);
      setCancelError('Failed to cancel request: ' + error.message);
    }
  };

  if (!userData) {
    return <div>Loading personal leave info...</div>;
  }

  // Dynamically calculate short leave balance based on current month usage
  // This ensures the balance always resets at the start of each month
  const currentMonthShortLeaveUsage = getCurrentMonthShortLeaveUsage(userData.uid, leaveRequests);
  const calculatedShortLeaveBalance = Math.max(0, LEAVE_CONFIG.SHORT_LEAVE_MONTHLY_LIMIT - currentMonthShortLeaveUsage);

  // Merge calculated short leave balance with stored balances
  const calculatedBalances = {
    ...userData.leaveBalance,
    shortLeave: calculatedShortLeaveBalance
  };

  return (
    <div className="space-y-8">
      <LeaveBalanceCard balances={calculatedBalances} gender={userData.gender} userData={userData} />
      <div className="bg-card p-6 rounded-lg shadow-sm border border-white/5">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-slate-200">My Leave Requests</h2>
          {userData.role !== 'CEO' && (
            <button
              onClick={() => setShowModal(true)}
              className="bg-[#411e75] text-white px-4 py-2 rounded-md hover:bg-[#5a2aa8] focus:outline-none focus:ring-2 focus:ring-[#c6a876] focus:ring-offset-2 transition duration-150 ease-in-out"
            >
              Apply for Leave
            </button>
          )}
        </div>
        {cancelError && <div className="mb-3 p-3 bg-red-900/30 text-red-300 rounded-md text-sm">{cancelError}</div>}
        {cancelSuccess && <div className="mb-3 p-3 bg-green-900/30 text-green-300 rounded-md text-sm">{cancelSuccess}</div>}
        <LeaveHistoryTable requests={leaveRequests} canCancel={true} onCancel={handleCancelRequest} />
      </div>
      {showModal && <LeaveRequestModal userData={userData} onClose={() => setShowModal(false)} />}
    </div>
  );
}
