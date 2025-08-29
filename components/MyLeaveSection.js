import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { getFirestore, collection, query, where, onSnapshot } from 'firebase/firestore';
import { app } from '../lib/firebase-client';
import LeaveBalanceCard from './LeaveBalanceCard';
import LeaveHistoryTable from './LeaveHistoryTable';
import LeaveRequestModal from './LeaveRequestModal';

const db = getFirestore(app);

export default function MyLeaveSection() {
  const { userData } = useAuth();
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    if (!userData?.uid) return;

    const q = query(collection(db, "leaveRequests"), where("userId", "==", userData.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
        const requests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        requests.sort((a, b) => {
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

  if (!userData) {
    return <div>Loading personal leave info...</div>;
  }

  return (
    <div className="space-y-8">
      <LeaveBalanceCard balances={userData.leaveBalance} />
      <div className="bg-card p-6 rounded-lg shadow-sm">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-slate-200">My Leave Requests</h2>
          {/* --- FIX IMPLEMENTED HERE --- */}
          {/* This button is now hidden only if the user's role is 'CEO' */}
          {userData.role !== 'CEO' && (
            <button
              onClick={() => setShowModal(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              Apply for Leave
            </button>
          )}
        </div>
        <LeaveHistoryTable requests={leaveRequests} />
      </div>
      {showModal && <LeaveRequestModal userData={userData} onClose={() => setShowModal(false)} />}
    </div>
  );
}
