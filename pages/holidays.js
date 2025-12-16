import React, { useState, useEffect } from 'react';
import { getFirestore, collection, onSnapshot, addDoc, deleteDoc, doc } from 'firebase/firestore';
import { app } from '../lib/firebase-client';
import DashboardLayout from '../components/DashboardLayout';
import { useAuth } from '../context/AuthContext';

const db = getFirestore(app);

export default function HolidaysPage() {
    const { userData } = useAuth();
    const [holidays, setHolidays] = useState([]);
    const [newHoliday, setNewHoliday] = useState({ date: '', name: '' });
    const [error, setError] = useState('');

    useEffect(() => {
        const unsubscribe = onSnapshot(collection(db, 'holidays'), (snapshot) => {
            const holidaysData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            holidaysData.sort((a, b) => new Date(a.date) - new Date(b.date));
            setHolidays(holidaysData);
        });
        return () => unsubscribe();
    }, []);

    const handleAddHoliday = async (e) => {
        e.preventDefault();
        setError('');
        if (!newHoliday.date || !newHoliday.name) {
            setError('Please enter both a date and a name for the holiday.');
            return;
        }

        try {
            await addDoc(collection(db, 'holidays'), newHoliday);
            setNewHoliday({ date: '', name: '' });
        } catch (err) {
            setError('Failed to add holiday. Please try again.');
        }
    };

    const handleDeleteHoliday = async (holidayId) => {
        try {
            await deleteDoc(doc(db, 'holidays', holidayId));
        } catch (err) {
            setError('Failed to delete holiday. Please try again.');
        }
    };

    const isAdmin = userData?.role === 'Admin' || userData?.role === 'Manager HR';

    return (
        <DashboardLayout>
            <div className="space-y-8">
                <div className="bg-card p-6 rounded-lg shadow-sm">
                    <h2 className="text-xl font-semibold text-slate-200 mb-4">Company Holiday Calendar</h2>
                    {isAdmin && (
                        <form onSubmit={handleAddHoliday} className="mb-6 space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-1">Date</label>
                                    <input
                                        type="date"
                                        value={newHoliday.date}
                                        onChange={(e) => setNewHoliday({ ...newHoliday, date: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-200 bg-card"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-1">Holiday Name</label>
                                    <input
                                        type="text"
                                        value={newHoliday.name}
                                        onChange={(e) => setNewHoliday({ ...newHoliday, name: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-200 bg-card"
                                        placeholder="e.g., New Year's Day"
                                    />
                                </div>
                                <div className="flex items-end">
                                    <button
                                        type="submit"
                                        className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition duration-150 ease-in-out"
                                    >
                                        Add Holiday
                                    </button>
                                </div>
                            </div>
                            {error && <p className="text-red-400 mt-2">{error}</p>}
                        </form>
                    )}
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-700">
                            <thead className="bg-muted">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Date</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Holiday</th>
                                    {isAdmin && <th className="px-6 py-3 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">Actions</th>}
                                </tr>
                            </thead>
                            <tbody className="bg-card divide-y divide-gray-700">
                                {holidays.map(holiday => (
                                    <tr key={holiday.id}>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-200">{new Date(holiday.date).toLocaleDateString()}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400">{holiday.name}</td>
                                        {isAdmin && (
                                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                                <button
                                                    onClick={() => handleDeleteHoliday(holiday.id)}
                                                    className="text-red-400 hover:text-red-300"
                                                >
                                                    Delete
                                                </button>
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </DashboardLayout>
    );
}
