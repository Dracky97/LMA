import React, { useState } from 'react';
import { getFirestore, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { app } from '../lib/firebase-client';

const db = getFirestore(app);

export default function LeaveRequestModal({ userData, onClose }) {
    const [type, setType] = useState('Annual');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [reason, setReason] = useState('');
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        // Basic validation
        if (!startDate || !endDate || !reason) {
            setError('Please fill in all required fields.');
            return;
        }
        
        if (new Date(endDate) < new Date(startDate)) {
            setError('End date must be after start date.');
            return;
        }
        
        if (!userData.managerId) {
            setError('You do not have a manager assigned. Please contact an Admin.');
            return;
        }

        try {
            await addDoc(collection(db, "leaveRequests"), {
                userId: userData.uid,
                userName: userData.name,
                managerId: userData.managerId,
                department: userData.department,
                type,
                startDate: new Date(startDate),
                endDate: new Date(endDate),
                reason,
                status: 'Pending',
                appliedOn: serverTimestamp(),
            });
            onClose();
        } catch (err) {
            console.error("Error submitting leave request:", err);
            console.error("Request data:", {
                userId: userData.uid,
                userName: userData.name,
                managerId: userData.managerId,
                department: userData.department,
                type,
                startDate: new Date(startDate),
                endDate: new Date(endDate),
                reason,
                status: 'Pending',
                appliedOn: serverTimestamp(),
            });
            setError('Failed to submit request. Please try again.');
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4">
            <div className="bg-card rounded-lg shadow-xl w-full max-w-md">
                <div className="p-6">
                    <h2 className="text-xl font-bold text-slate-200 mb-4">Apply for Leave</h2>
                    {error && <div className="mb-4 text-red-400 bg-red-900/30 p-3 rounded">{error}</div>}
                    <form onSubmit={handleSubmit}>
                        <div className="mb-4">
                            <label className="block text-sm font-medium text-slate-300 mb-1">Leave Type</label>
                            <select
                                value={type}
                                onChange={(e) => setType(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-card text-slate-200"
                            >
                                <option value="Annual">Annual Leave</option>
                                <option value="Casual">Casual Leave</option>
                                <option value="Medical">Medical Leave</option>
                                <option value="Unpaid">Unpaid Leave</option>
                            </select>
                        </div>
                        <div className="grid grid-cols-2 gap-4 mb-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1">Start Date</label>
                                <input
                                    type="date"
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-card text-slate-200"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1">End Date</label>
                                <input
                                    type="date"
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-card text-slate-200"
                                    required
                                />
                            </div>
                        </div>
                        <div className="mb-6">
                            <label className="block text-sm font-medium text-slate-300 mb-1">Reason</label>
                            <textarea
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-card text-slate-200"
                                rows="3"
                                required
                            ></textarea>
                        </div>
                        <div className="flex justify-end space-x-3">
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-4 py-2 text-sm font-medium text-slate-300 bg-card border border-gray-600 rounded-md hover:bg-muted focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                            >
                                Submit Request
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};
