import React, { useState, useEffect } from 'react';
import { getFirestore, collection, onSnapshot, doc, updateDoc, writeBatch } from 'firebase/firestore';
import { app } from '../../lib/firebase-client';
import { useAuth } from '../../context/AuthContext';
import { getAnnualLeaveAllocation } from '../../lib/leaveTypes';

const db = getFirestore(app);

export default function AdminDashboard() {
    const [users, setUsers] = useState([]);
    const [managers, setManagers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showAddUserForm, setShowAddUserForm] = useState(false);
    const [newUser, setNewUser] = useState({
        name: '',
        email: '',
        password: '',
        department: '',
        managerId: '',
        employeeNumber: '',
        gender: ''
    });
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [resetInProgress, setResetInProgress] = useState(false);
    const [resetMessage, setResetMessage] = useState('');
    const [showPasswordDialog, setShowPasswordDialog] = useState(false);
    const [adminPassword, setAdminPassword] = useState('');
    const [passwordError, setPasswordError] = useState('');
    const { signup } = useAuth();

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

    // Department options
    const departmentOptions = [
        { value: 'Human Resources', label: 'Human Resources' },
        { value: 'Finance', label: 'Finance' },
        { value: 'Academic', label: 'Academic' },
        { value: 'Marketing', label: 'Marketing' },
        { value: 'Administration', label: 'Administration' },
        { value: 'IT', label: 'IT' },
        { value: 'Registrar', label: 'Registrar' },
        { value: 'Student Support', label: 'Student Support' }
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

    const handleAddUserChange = (e) => {
        const { name, value } = e.target;
        setNewUser(prev => ({
            ...prev,
            [name]: value
        }));
    };

    const handleAddUserSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setSuccess('');
        
        try {
            await signup(
                newUser.name,
                newUser.email,
                newUser.password,
                newUser.department,
                newUser.managerId || null,
                newUser.employeeNumber || null,
                newUser.gender || null
            );
            setSuccess('User added successfully!');
            // Reset form
            setNewUser({
                name: '',
                email: '',
                password: '',
                department: '',
                managerId: '',
                employeeNumber: '',
                gender: ''
            });
            // Close the form after a short delay
            setTimeout(() => {
                setShowAddUserForm(false);
                setSuccess('');
            }, 1500);
        } catch (err) {
            setError(err.message || 'Failed to add user');
        }
    };

    const handleResetAllLeaveBalances = () => {
        setShowPasswordDialog(true);
        setAdminPassword('');
        setPasswordError('');
    };

    const confirmResetWithPassword = async () => {
        // Simple password validation (you can make this more sophisticated)
        if (adminPassword !== 'admin123') {
            setPasswordError('Incorrect password. Please try again.');
            return;
        }

        setShowPasswordDialog(false);
        setPasswordError('');
        
        if (!window.confirm('Are you sure you want to reset all users\' leave balances? This action cannot be undone.')) {
            return;
        }

        setResetInProgress(true);
        setResetMessage('');
        
        try {
            const batch = writeBatch(db);
            let updateCount = 0;
            
            users.forEach(user => {
                const userRef = doc(db, 'users', user.id);
                
                // Calculate new annual leave allocation
                const newAnnualLeave = getAnnualLeaveAllocation(user.createdAt);
                
                // Reset leave balances to standard allocations
                const resetBalances = {
                    annualLeave: newAnnualLeave,
                    sickLeave: 7,
                    casualLeave: 7,
                    'leave in-lieu': 0,
                    shortLeave: 12,
                    other: 0
                };
                
                // Add gender-specific leaves
                if (user.gender === 'female') {
                    resetBalances.maternityLeave = 84;
                } else if (user.gender === 'male') {
                    resetBalances.paternityLeave = 3;
                }
                
                batch.update(userRef, { leaveBalance: resetBalances });
                updateCount++;
            });
            
            await batch.commit();
            setResetMessage(`Successfully reset leave balances for ${updateCount} users`);
            
        } catch (error) {
            console.error('Error resetting leave balances:', error);
            setResetMessage(`Error resetting leave balances: ${error.message}`);
        } finally {
            setResetInProgress(false);
            setAdminPassword('');
            // Clear message after 5 seconds
            setTimeout(() => setResetMessage(''), 5000);
        }
    };

    if (loading) {
        return <div>Loading users...</div>;
    }

    return (
        <div className="space-y-6">
            {/* Leave Balance Reset Section */}
            <div className="bg-card p-6 rounded-lg shadow-sm">
                <div className="flex justify-between items-center mb-4">
                    <div>
                        <h2 className="text-xl font-semibold text-slate-200">System Management</h2>
                        <p className="text-sm text-slate-400 mt-1">Reset all users' leave balances to annual allocations</p>
                    </div>
                    <button
                        onClick={handleResetAllLeaveBalances}
                        disabled={resetInProgress}
                        className="bg-red-600 hover:bg-red-700 disabled:bg-red-800 disabled:opacity-50 text-white px-4 py-2 rounded-md text-sm font-medium transition duration-150 ease-in-out flex items-center space-x-2"
                    >
                        {resetInProgress ? (
                            <>
                                <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                <span>Resetting...</span>
                            </>
                        ) : (
                            <>
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                                <span>Reset All Leave Balances</span>
                            </>
                        )}
                    </button>
                </div>
                
                {resetMessage && (
                    <div className={`p-3 rounded-md text-sm ${resetMessage.includes('Successfully') ? 'bg-green-900/30 text-green-300' : 'bg-red-900/30 text-red-300'}`}>
                        {resetMessage}
                    </div>
                )}
            </div>

            {/* User Management Section */}
            <div className="bg-card p-6 rounded-lg shadow-sm">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-semibold text-slate-200">User Management</h2>
                    <button
                        onClick={() => setShowAddUserForm(true)}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium transition duration-150 ease-in-out"
                    >
                        Add New User
                    </button>
                </div>
            
            {showAddUserForm && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-card rounded-lg shadow-xl w-full max-w-md">
                        <div className="p-6">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-lg font-medium text-slate-200">Add New User</h3>
                                <button
                                    onClick={() => {
                                        setShowAddUserForm(false);
                                        setError('');
                                        setSuccess('');
                                    }}
                                    className="text-slate-400 hover:text-slate-200"
                                >
                                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                            
                            {error && (
                                <div className="mb-4 p-3 bg-red-900/30 text-red-300 rounded-md text-sm">
                                    {error}
                                </div>
                            )}
                            
                            {success && (
                                <div className="mb-4 p-3 bg-green-900/30 text-green-300 rounded-md text-sm">
                                    {success}
                                </div>
                            )}
                            
                            <form onSubmit={handleAddUserSubmit}>
                                <div className="mb-4">
                                    <label className="block text-sm font-medium text-slate-300 mb-1">Full Name</label>
                                    <input
                                        type="text"
                                        name="name"
                                        value={newUser.name}
                                        onChange={handleAddUserChange}
                                        required
                                        className="w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-200 bg-card"
                                        placeholder="Enter full name"
                                    />
                                </div>
                                
                                <div className="mb-4">
                                    <label className="block text-sm font-medium text-slate-300 mb-1">Email Address</label>
                                    <input
                                        type="email"
                                        name="email"
                                        value={newUser.email}
                                        onChange={handleAddUserChange}
                                        required
                                        className="w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-200 bg-card"
                                        placeholder="Enter email address"
                                    />
                                </div>
                                
                                <div className="mb-4">
                                    <label className="block text-sm font-medium text-slate-300 mb-1">Password</label>
                                    <input
                                        type="password"
                                        name="password"
                                        value={newUser.password}
                                        onChange={handleAddUserChange}
                                        required
                                        className="w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-200 bg-card"
                                        placeholder="Enter password"
                                    />
                                </div>
                                
                                <div className="mb-4">
                                    <label className="block text-sm font-medium text-slate-300 mb-1">Department</label>
                                    <select
                                        name="department"
                                        value={newUser.department}
                                        onChange={handleAddUserChange}
                                        required
                                        className="w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-200 bg-card"
                                    >
                                        <option value="">Select Department</option>
                                        {departmentOptions.map(dept => (
                                            <option key={dept.value} value={dept.value}>{dept.label}</option>
                                        ))}
                                    </select>
                                </div>
                                
                                <div className="mb-4">
                                    <label className="block text-sm font-medium text-slate-300 mb-1">Manager (Optional)</label>
                                    <select
                                        name="managerId"
                                        value={newUser.managerId}
                                        onChange={handleAddUserChange}
                                        className="w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-200 bg-card"
                                    >
                                        <option value="">No Manager (Top Level)</option>
                                        {managers.map(manager => (
                                            <option key={manager.id} value={manager.id}>
                                                {manager.name} ({manager.role})
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                
                                <div className="mb-4">
                                    <label className="block text-sm font-medium text-slate-300 mb-1">Employee Number (Optional)</label>
                                    <input
                                        type="text"
                                        name="employeeNumber"
                                        value={newUser.employeeNumber}
                                        onChange={handleAddUserChange}
                                        className="w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-200 bg-card"
                                        placeholder="Enter employee number"
                                    />
                                </div>
                                
                                <div className="mb-4">
                                    <label className="block text-sm font-medium text-slate-300 mb-1">Gender</label>
                                    <select
                                        name="gender"
                                        value={newUser.gender}
                                        onChange={handleAddUserChange}
                                        required
                                        className="w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-200 bg-card"
                                    >
                                        <option value="">Select Gender</option>
                                        <option value="male">Male</option>
                                        <option value="female">Female</option>
                                    </select>
                                </div>
                                
                                <div className="flex justify-end space-x-3">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setShowAddUserForm(false);
                                            setError('');
                                            setSuccess('');
                                        }}
                                        className="px-4 py-2 border border-gray-600 text-slate-300 rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 transition duration-150 ease-in-out"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition duration-150 ease-in-out"
                                    >
                                        Add User
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}

            {/* Password Confirmation Dialog */}
            {showPasswordDialog && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-card rounded-lg shadow-xl w-full max-w-md">
                        <div className="p-6">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-lg font-medium text-slate-200">Confirm Admin Password</h3>
                                <button
                                    onClick={() => {
                                        setShowPasswordDialog(false);
                                        setPasswordError('');
                                        setAdminPassword('');
                                    }}
                                    className="text-slate-400 hover:text-slate-200"
                                >
                                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                            
                            <p className="text-sm text-slate-300 mb-4">
                                Please enter the admin password to confirm resetting all leave balances. This action cannot be undone.
                            </p>
                            
                            {passwordError && (
                                <div className="mb-4 p-3 bg-red-900/30 text-red-300 rounded-md text-sm">
                                    {passwordError}
                                </div>
                            )}
                            
                            <div className="mb-6">
                                <label className="block text-sm font-medium text-slate-300 mb-2">Admin Password</label>
                                <input
                                    type="password"
                                    value={adminPassword}
                                    onChange={(e) => setAdminPassword(e.target.value)}
                                    onKeyPress={(e) => e.key === 'Enter' && confirmResetWithPassword()}
                                    className="w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 text-slate-200 bg-card"
                                    placeholder="Enter admin password"
                                    autoFocus
                                />
                            </div>
                            
                            <div className="flex justify-end space-x-3">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowPasswordDialog(false);
                                        setPasswordError('');
                                        setAdminPassword('');
                                    }}
                                    className="px-4 py-2 border border-gray-600 text-slate-300 rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 transition duration-150 ease-in-out"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={confirmResetWithPassword}
                                    className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 transition duration-150 ease-in-out"
                                >
                                    Confirm Reset
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            
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
        </div>
    );
}
