import React, { useState, useEffect } from 'react';
import { getFirestore, collection, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { app } from '../../lib/firebase-client';

const db = getFirestore(app);

export default function AdminDashboard() {
    const [users, setUsers] = useState([]);
    const [managers, setManagers] = useState([]);
    const [loading, setLoading] = useState(true);

    const roleOptions = [
        'Employee',
        'CEO',
        'CMO',
        'CFO',
        'COO',
        'Head of Academic',
        'Head - Student Support',
        'Manager IT',
        'Finance Manager',
        'Manager HR',
        'Manager - Marketing & Student Enrolment',
        'Manager - Digital Marketing',
        'Sales Manager'
    ];

    useEffect(() => {
        const usersCollectionRef = collection(db, 'users');
        const unsubscribe = onSnapshot(usersCollectionRef, (snapshot) => {
            const usersList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            const managerList = usersList.filter(user => user.role !== 'Employee');
            setUsers(usersList);
            setManagers(managerList);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching users:", error);
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    const handleFieldUpdate = async (userId, field, value) => {
        try {
            const userDocRef = doc(db, 'users', userId);
            const updateData = { [field]: value };
            if (field === 'role') {
                updateData.isManager = (value !== 'Employee');
            }
            await updateDoc(userDocRef, updateData);
        } catch (error) {
            console.error(`Error updating ${field}:`, error);
        }
    };

    if (loading) {
        return <div>Loading users...</div>;
    }

    return (
        <div className="bg-card p-6 rounded-lg shadow-sm">
            <h2 className="text-xl font-semibold text-slate-200 mb-4">User Management</h2>
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-700">
                    <thead className="bg-muted">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Name</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Role</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Is Manager?</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Employee Number</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Assign Manager</th>
                        </tr>
                    </thead>
                    <tbody className="bg-card divide-y divide-gray-700">
                        {users.map(user => (
                            <tr key={user.id}>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-200">{user.name}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400">
                                    <select
                                        value={user.role}
                                        onChange={(e) => handleFieldUpdate(user.id, 'role', e.target.value)}
                                        className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-600 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md text-slate-200 bg-card"
                                    >
                                        {roleOptions.map(role => <option key={role} value={role}>{role}</option>)}
                                    </select>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400">
                                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${user.isManager ? 'bg-green-900/30 text-green-300' : 'bg-red-900/30 text-red-300'}`}>
                                        {user.isManager ? 'Yes' : 'No'}
                                    </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400">
                                    <input
                                        type="text"
                                        value={user.employeeNumber || ''}
                                        onChange={(e) => handleFieldUpdate(user.id, 'employeeNumber', e.target.value)}
                                        className="mt-1 block w-full px-3 py-2 text-base border-gray-600 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md text-slate-200 bg-card"
                                        placeholder="Enter employee number"
                                    />
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400">
                                    <select
                                        value={user.managerId || ''}
                                        onChange={(e) => handleFieldUpdate(user.id, 'managerId', e.target.value)}
                                        className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-600 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md text-slate-200 bg-card"
                                    >
                                        <option value="">No Manager (Top Level)</option>
                                        {managers.map(manager => (
                                            <option key={manager.id} value={manager.id}>
                                                {manager.name} ({manager.role})
                                            </option>
                                        ))}
                                    </select>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
