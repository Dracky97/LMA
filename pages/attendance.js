import React, { useState, useEffect } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import { useAuth } from '../context/AuthContext';
import { getFirestore, collection, query, where, onSnapshot, limit, orderBy } from 'firebase/firestore';
import { app } from '../lib/firebase-client';

const db = getFirestore(app);

export default function AttendancePage() {
    const { userData } = useAuth();
    const [attendanceHistory, setAttendanceHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!userData) return;

        // Fetch the attendance history for the logged-in user
        const qHistory = query(
            collection(db, 'attendance'),
            where('userId', '==', userData.uid),
            orderBy('clockIn', 'desc'),
            limit(30) // Fetch the last 30 records
        );
        const unsubHistory = onSnapshot(qHistory, (snapshot) => {
            const history = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setAttendanceHistory(history);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching attendance history:", error);
            setError(error.message);
            setLoading(false);
        });

        return () => {
            unsubHistory();
        };
    }, [userData]);

    const parseTimestamp = (ts) => {
        if (!ts) return null;
        if (ts.toDate) return ts.toDate();
        if (ts.seconds) return new Date(ts.seconds * 1000);
        if (ts._seconds) return new Date(ts._seconds * 1000);
        const d = new Date(ts);
        return isNaN(d.getTime()) ? null : d;
    };

    const formatDate = (timestamp) => {
        const d = parseTimestamp(timestamp);
        if (!d) return 'N/A';
        return d.toLocaleString('en-US', {
            dateStyle: 'medium',
            timeStyle: 'short'
        });
    }

    return (
        <DashboardLayout>
            <div className="space-y-8">
                <div className="bg-card p-6 rounded-lg shadow-sm">
                    <h2 className="text-xl font-semibold text-slate-200 mb-4">My Attendance Log</h2>
                    <p className="text-sm text-slate-400 mb-4">
                        This data is automatically synced from the ZKTeco fingerprint machine.
                    </p>
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-700">
                            <thead className="bg-muted">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Date</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Clock In</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Clock Out</th>
                                </tr>
                            </thead>
                            <tbody className="bg-card divide-y divide-gray-700">
                                {loading ? (
                                    <tr><td colSpan="3" className="text-center py-8 text-slate-400">Loading attendance...</td></tr>
                                ) : error ? (
                                    <tr><td colSpan="3" className="text-center py-8 text-red-400">Error: {error}</td></tr>
                                ) : attendanceHistory.length > 0 ? (
                                    attendanceHistory.map(record => (
                                        <tr key={record.id}>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-200">{(parseTimestamp(record.clockIn) || new Date()).toLocaleDateString()}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400">{formatDate(record.clockIn)}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400">{record.clockOut ? formatDate(record.clockOut) : '---'}</td>
                                        </tr>
                                    ))
                                ) : (
                                     <tr><td colSpan="3" className="text-center py-8 text-slate-400">No attendance records found.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </DashboardLayout>
    );
}
