import React, { useState, useEffect } from 'react';
import { getFirestore, collection, onSnapshot, doc, updateDoc, writeBatch } from 'firebase/firestore';
import { app } from '../../lib/firebase-client';
import { useAuth } from '../../context/AuthContext';
import { getAnnualLeaveAllocation } from '../../lib/leaveTypes';

const db = getFirestore(app);

export default function AdminDashboard() {
    const [users, setUsers] = useState([]);
    const [filteredUsers, setFilteredUsers] = useState([]);
    const [managers, setManagers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [roleFilter, setRoleFilter] = useState('');
    const [departmentFilter, setDepartmentFilter] = useState('');
    const [managerFilter, setManagerFilter] = useState('');
    const [showAddUserForm, setShowAddUserForm] = useState(false);
    const [newUser, setNewUser] = useState({
        name: '',
        email: '',
        password: '',
        department: '',
        managerId: '',
        employeeNumber: '',
        gender: '',
        designation: '',
        birthday: '',
        employeeStatus: 'probation',
        joinedDate: ''
    });
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [resetInProgress, setResetInProgress] = useState(false);
    const [resetMessage, setResetMessage] = useState('');
    const [showPasswordDialog, setShowPasswordDialog] = useState(false);
    const [adminPassword, setAdminPassword] = useState('');
    const [passwordError, setPasswordError] = useState('');
    const [editingUser, setEditingUser] = useState(null);
    const [showEditModal, setShowEditModal] = useState(false);
    const [editUserData, setEditUserData] = useState({});
    const [showStatusChangeModal, setShowStatusChangeModal] = useState(false);
    const [statusChangeUser, setStatusChangeUser] = useState(null);
    const [newStatus, setNewStatus] = useState('');
    const [statusChangeReason, setStatusChangeReason] = useState('');
    const [showJoinedDateModal, setShowJoinedDateModal] = useState(false);
    const [joinedDateUser, setJoinedDateUser] = useState(null);
    const [newJoinedDate, setNewJoinedDate] = useState('');
    const [joinedDateReason, setJoinedDateReason] = useState('');
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);
    const { signup, userData: currentUserData } = useAuth();

    const roleOptions = [
        'Employee',
        'Admin',
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
        { value: 'Operations', label: 'Operations' },
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

    // Filter users based on search query and filters
    useEffect(() => {
        let filtered = users;

        // Apply search query filter
        if (searchQuery.trim()) {
            filtered = filtered.filter(user =>
                user.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                user.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                user.employeeNumber?.toLowerCase().includes(searchQuery.toLowerCase())
            );
        }

        // Apply role filter
        if (roleFilter) {
            filtered = filtered.filter(user => user.role === roleFilter);
        }

        // Apply department filter
        if (departmentFilter) {
            filtered = filtered.filter(user => user.department === departmentFilter);
        }

        // Apply manager filter
        if (managerFilter) {
            if (managerFilter === 'no-manager') {
                filtered = filtered.filter(user => !user.managerId);
            } else {
                filtered = filtered.filter(user => user.managerId === managerFilter);
            }
        }

        setFilteredUsers(filtered);
    }, [users, searchQuery, roleFilter, departmentFilter, managerFilter]);

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

    const openStatusChangeModal = (user) => {
        setStatusChangeUser(user);
        setNewStatus(user.employeeStatus || 'probation');
        setStatusChangeReason('');
        setShowStatusChangeModal(true);
    };

    const handleStatusChange = async () => {
        if (!statusChangeUser || !newStatus) {
            setError('Please select a new status');
            return;
        }

        try {
            const userDocRef = doc(db, 'users', statusChangeUser.id);
            await updateDoc(userDocRef, {
                employeeStatus: newStatus,
                statusChangeReason: statusChangeReason,
                statusChangedAt: new Date().toISOString(),
                statusChangedBy: currentUserData?.uid || 'admin'
            });

            setSuccess(`Employee status updated to ${newStatus} for ${statusChangeUser.name}`);
            setShowStatusChangeModal(false);
            setStatusChangeUser(null);
            setNewStatus('');
            setStatusChangeReason('');
        } catch (error) {
            console.error('Error updating employee status:', error);
            setError('Failed to update employee status: ' + error.message);
        }
    };

    const openJoinedDateModal = (user) => {
        setJoinedDateUser(user);
        setNewJoinedDate(user.joinedDate ? new Date(user.joinedDate).toISOString().split('T')[0] : '');
        setJoinedDateReason('');
        setShowJoinedDateModal(true);
    };

    const handleJoinedDateChange = async () => {
        if (!joinedDateUser || !newJoinedDate) {
            setError('Please select a new joined date');
            return;
        }

        try {
            const userDocRef = doc(db, 'users', joinedDateUser.id);
            const joinedDateObj = new Date(newJoinedDate);

            // Calculate new next evaluation date (3 months from new joined date)
            const nextEvaluationDate = new Date(joinedDateObj);
            nextEvaluationDate.setMonth(nextEvaluationDate.getMonth() + 3);

            await updateDoc(userDocRef, {
                joinedDate: joinedDateObj.toISOString(),
                nextEvaluationDate: nextEvaluationDate.toISOString(),
                joinedDateChangeReason: joinedDateReason,
                joinedDateChangedAt: new Date().toISOString(),
                joinedDateChangedBy: currentUserData?.uid || 'admin'
            });

            setSuccess(`Joined date updated to ${newJoinedDate} for ${joinedDateUser.name}`);
            setShowJoinedDateModal(false);
            setJoinedDateUser(null);
            setNewJoinedDate('');
            setJoinedDateReason('');
        } catch (error) {
            console.error('Error updating joined date:', error);
            setError('Failed to update joined date: ' + error.message);
        }
    };

    const handleDeleteUser = async (userId) => {
        try {
            // Delete user document from Firestore
            const userDocRef = doc(db, 'users', userId);
            await updateDoc(userDocRef, {
                deleted: true,
                deletedAt: new Date(),
                deletedBy: users.find(u => u.role === 'Admin')?.id || 'admin'
            });
            
            // You might also want to delete from Firebase Auth, but that requires admin SDK
            setSuccess('User deleted successfully');
            setShowDeleteConfirm(null);
        } catch (error) {
            console.error('Error deleting user:', error);
            setError('Failed to delete user: ' + error.message);
        }
    };

    const openEditModal = (user) => {
        setEditingUser(user);
        setEditUserData({
            name: user.name || '',
            email: user.email || '',
            role: user.role || 'Employee',
            department: user.department || '',
            designation: user.designation || '',
            employeeNumber: user.employeeNumber || '',
            gender: user.gender || '',
            managerId: user.managerId || '',
            personalDetails: user.personalDetails || { phone: '', address: '', dob: '' },
            leaveBalance: user.leaveBalance || {}
        });
        setShowEditModal(true);
    };

    const handleEditUserChange = (e, section = null) => {
        const { name, value } = e.target;
        
        if (section) {
            setEditUserData(prev => ({
                ...prev,
                [section]: { ...prev[section], [name]: value }
            }));
        } else {
            setEditUserData(prev => ({
                ...prev,
                [name]: value
            }));
        }
    };

    const handleLeaveBalanceChange = (leaveType, value) => {
        setEditUserData(prev => ({
            ...prev,
            leaveBalance: {
                ...prev.leaveBalance,
                [leaveType]: parseFloat(value) || 0
            }
        }));
    };

    const saveUserChanges = async () => {
        try {
            const userDocRef = doc(db, 'users', editingUser.id);
            const updateData = { ...editUserData };

            // Update isManager flag based on role
            updateData.isManager = (updateData.role !== 'Employee');

            // If joined date was changed, recalculate next evaluation date
            if (editUserData.joinedDate && editUserData.joinedDate !== editingUser.joinedDate) {
                const joinedDateObj = new Date(editUserData.joinedDate);
                const nextEvaluationDate = new Date(joinedDateObj);
                nextEvaluationDate.setMonth(nextEvaluationDate.getMonth() + 3);
                updateData.nextEvaluationDate = nextEvaluationDate.toISOString();
            }

            await updateDoc(userDocRef, updateData);
            setSuccess('User updated successfully');
            setShowEditModal(false);
            setEditingUser(null);
        } catch (error) {
            console.error('Error updating user:', error);
            setError('Failed to update user: ' + error.message);
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
                newUser.gender || null,
                newUser.designation || null,
                newUser.birthday || null,
                newUser.employeeStatus || 'probation',
                newUser.joinedDate || null
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
                gender: '',
                designation: '',
                birthday: '',
                employeeStatus: 'probation',
                joinedDate: ''
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
<p className="text-sm text-slate-400 mt-1">Reset all users&apos; leave balances to annual allocations</p>
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

                {/* Search and Filters */}
                <div className="mb-6 space-y-4">
                    {/* Search Bar */}
                    <div className="relative">
                        <input
                            type="text"
                            placeholder="Search by name, email, or employee number..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-200 bg-card"
                        />
                        <svg className="absolute left-3 top-2.5 h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    </div>

                    {/* Filter Row */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        {/* Role Filter */}
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1">Filter by Role</label>
                            <select
                                value={roleFilter}
                                onChange={(e) => setRoleFilter(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-200 bg-card"
                            >
                                <option value="">All Roles</option>
                                {roleOptions.map(role => (
                                    <option key={role} value={role}>{role}</option>
                                ))}
                            </select>
                        </div>

                        {/* Department Filter */}
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1">Filter by Department</label>
                            <select
                                value={departmentFilter}
                                onChange={(e) => setDepartmentFilter(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-200 bg-card"
                            >
                                <option value="">All Departments</option>
                                {departmentOptions.map(dept => (
                                    <option key={dept.value} value={dept.value}>{dept.label}</option>
                                ))}
                            </select>
                        </div>

                        {/* Manager Filter */}
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1">Filter by Manager</label>
                            <select
                                value={managerFilter}
                                onChange={(e) => setManagerFilter(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-200 bg-card"
                            >
                                <option value="">All Managers</option>
                                <option value="no-manager">No Manager</option>
                                {managers.map(manager => (
                                    <option key={manager.id} value={manager.id}>
                                        {manager.name} ({manager.role})
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Clear Filters */}
                        <div className="flex items-end">
                            <button
                                onClick={() => {
                                    setSearchQuery('');
                                    setRoleFilter('');
                                    setDepartmentFilter('');
                                    setManagerFilter('');
                                }}
                                className="w-full px-3 py-2 border border-gray-600 text-slate-300 rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 transition duration-150 ease-in-out"
                            >
                                Clear Filters
                            </button>
                        </div>
                    </div>

                    {/* Results Count */}
                    <div className="text-sm text-slate-400">
                        Showing {filteredUsers.length} of {users.length} users
                    </div>
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
                                
                                <div className="mb-4">
                                    <label className="block text-sm font-medium text-slate-300 mb-1">Designation (Optional)</label>
                                    <input
                                        type="text"
                                        name="designation"
                                        value={newUser.designation}
                                        onChange={handleAddUserChange}
                                        className="w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-200 bg-card"
                                        placeholder="e.g., Senior Developer, Marketing Specialist"
                                    />
                                </div>
                                
                                <div className="mb-4">
                                    <label className="block text-sm font-medium text-slate-300 mb-1">Birthday (Optional)</label>
                                    <input
                                        type="date"
                                        name="birthday"
                                        value={newUser.birthday}
                                        onChange={handleAddUserChange}
                                        className="w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-200 bg-card"
                                    />
                                </div>

                                <div className="mb-4">
                                    <label className="block text-sm font-medium text-slate-300 mb-1">Employee Status</label>
                                    <select
                                        name="employeeStatus"
                                        value={newUser.employeeStatus}
                                        onChange={handleAddUserChange}
                                        required
                                        className="w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-200 bg-card"
                                    >
                                        <option value="permanent">Permanent</option>
                                        <option value="probation">Probation</option>
                                        <option value="intern">Intern</option>
                                    </select>
                                </div>

                                <div className="mb-4">
                                    <label className="block text-sm font-medium text-slate-300 mb-1">Joined Date</label>
                                    <input
                                        type="date"
                                        name="joinedDate"
                                        value={newUser.joinedDate}
                                        onChange={handleAddUserChange}
                                        className="w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-200 bg-card"
                                    />
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

            {/* User Edit Modal */}
            {showEditModal && editingUser && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-card rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
                        <div className="p-6">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-lg font-medium text-slate-200">Edit User: {editingUser.name}</h3>
                                <button
                                    onClick={() => {
                                        setShowEditModal(false);
                                        setEditingUser(null);
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
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Basic Information */}
                                <div className="space-y-4">
                                    <h4 className="text-md font-semibold text-slate-300">Basic Information</h4>
                                    
                                    <div>
                                        <label className="block text-sm font-medium text-slate-300 mb-1">Name</label>
                                        <input
                                            type="text"
                                            name="name"
                                            value={editUserData.name}
                                            onChange={handleEditUserChange}
                                            className="w-full px-3 py-2 border border-gray-600 rounded-md text-slate-200 bg-card focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        />
                                    </div>
                                    
                                    <div>
                                        <label className="block text-sm font-medium text-slate-300 mb-1">Email</label>
                                        <input
                                            type="email"
                                            name="email"
                                            value={editUserData.email}
                                            onChange={handleEditUserChange}
                                            className="w-full px-3 py-2 border border-gray-600 rounded-md text-slate-200 bg-card focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        />
                                    </div>
                                    
                                    <div>
                                        <label className="block text-sm font-medium text-slate-300 mb-1">Role</label>
                                        <select
                                            name="role"
                                            value={editUserData.role}
                                            onChange={handleEditUserChange}
                                            className="w-full px-3 py-2 border border-gray-600 rounded-md text-slate-200 bg-card focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        >
                                            {roleOptions.map(role => (
                                                <option key={role} value={role}>{role}</option>
                                            ))}
                                        </select>
                                    </div>
                                    
                                    <div>
                                        <label className="block text-sm font-medium text-slate-300 mb-1">Department</label>
                                        <select
                                            name="department"
                                            value={editUserData.department}
                                            onChange={handleEditUserChange}
                                            className="w-full px-3 py-2 border border-gray-600 rounded-md text-slate-200 bg-card focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        >
                                            <option value="">Select Department</option>
                                            {departmentOptions.map(dept => (
                                                <option key={dept.value} value={dept.value}>{dept.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                    
                                    <div>
                                        <label className="block text-sm font-medium text-slate-300 mb-1">Designation</label>
                                        <input
                                            type="text"
                                            name="designation"
                                            value={editUserData.designation}
                                            onChange={handleEditUserChange}
                                            className="w-full px-3 py-2 border border-gray-600 rounded-md text-slate-200 bg-card focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        />
                                    </div>
                                    
                                    <div>
                                        <label className="block text-sm font-medium text-slate-300 mb-1">Employee Number</label>
                                        <input
                                            type="text"
                                            name="employeeNumber"
                                            value={editUserData.employeeNumber}
                                            onChange={handleEditUserChange}
                                            className="w-full px-3 py-2 border border-gray-600 rounded-md text-slate-200 bg-card focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        />
                                    </div>
                                    
                                    <div>
                                        <label className="block text-sm font-medium text-slate-300 mb-1">Gender</label>
                                        <select
                                            name="gender"
                                            value={editUserData.gender}
                                            onChange={handleEditUserChange}
                                            className="w-full px-3 py-2 border border-gray-600 rounded-md text-slate-200 bg-card focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        >
                                            <option value="">Select Gender</option>
                                            <option value="male">Male</option>
                                            <option value="female">Female</option>
                                        </select>
                                    </div>
                                    
                                    <div>
                                        <label className="block text-sm font-medium text-slate-300 mb-1">Manager</label>
                                        <select
                                            name="managerId"
                                            value={editUserData.managerId}
                                            onChange={handleEditUserChange}
                                            className="w-full px-3 py-2 border border-gray-600 rounded-md text-slate-200 bg-card focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        >
                                            <option value="">No Manager (Top Level)</option>
                                            {managers.map(manager => (
                                                <option key={manager.id} value={manager.id}>
                                                    {manager.name} ({manager.role})
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                {/* Personal Details & Leave Balance */}
                                <div className="space-y-4">
                                    <h4 className="text-md font-semibold text-slate-300">Personal Details</h4>
                                    
                                    <div>
                                        <label className="block text-sm font-medium text-slate-300 mb-1">Phone</label>
                                        <input
                                            type="text"
                                            name="phone"
                                            value={editUserData.personalDetails?.phone || ''}
                                            onChange={(e) => handleEditUserChange(e, 'personalDetails')}
                                            className="w-full px-3 py-2 border border-gray-600 rounded-md text-slate-200 bg-card focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        />
                                    </div>
                                    
                                    <div>
                                        <label className="block text-sm font-medium text-slate-300 mb-1">Address</label>
                                        <textarea
                                            name="address"
                                            value={editUserData.personalDetails?.address || ''}
                                            onChange={(e) => handleEditUserChange(e, 'personalDetails')}
                                            className="w-full px-3 py-2 border border-gray-600 rounded-md text-slate-200 bg-card focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            rows="2"
                                        />
                                    </div>
                                    
                                    <div>
                                        <label className="block text-sm font-medium text-slate-300 mb-1">Date of Birth</label>
                                        <input
                                            type="date"
                                            name="dob"
                                            value={editUserData.personalDetails?.dob || ''}
                                            onChange={(e) => handleEditUserChange(e, 'personalDetails')}
                                            className="w-full px-3 py-2 border border-gray-600 rounded-md text-slate-200 bg-card focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-slate-300 mb-1">Joined Date</label>
                                        <input
                                            type="date"
                                            name="joinedDate"
                                            value={editUserData.joinedDate ? new Date(editUserData.joinedDate).toISOString().split('T')[0] : ''}
                                            onChange={handleEditUserChange}
                                            className="w-full px-3 py-2 border border-gray-600 rounded-md text-slate-200 bg-card focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        />
                                    </div>
                                    
                                    <h4 className="text-md font-semibold text-slate-300 mt-6">Leave Balance</h4>
                                    
                                    {Object.entries(editUserData.leaveBalance || {}).map(([leaveType, balance]) => (
                                        <div key={leaveType}>
                                            <label className="block text-sm font-medium text-slate-300 mb-1 capitalize">
                                                {leaveType.replace(/([A-Z])/g, ' $1').trim()}
                                            </label>
                                            <input
                                                type="number"
                                                step="0.5"
                                                value={balance}
                                                onChange={(e) => handleLeaveBalanceChange(leaveType, e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-600 rounded-md text-slate-200 bg-card focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>
                            
                            {error && (
                                <div className="mt-4 p-3 bg-red-900/30 text-red-300 rounded-md text-sm">
                                    {error}
                                </div>
                            )}
                            
                            {success && (
                                <div className="mt-4 p-3 bg-green-900/30 text-green-300 rounded-md text-sm">
                                    {success}
                                </div>
                            )}
                            
                            <div className="flex justify-end space-x-3 mt-6">
                                <button
                                    onClick={() => {
                                        setShowEditModal(false);
                                        setEditingUser(null);
                                        setError('');
                                        setSuccess('');
                                    }}
                                    className="px-4 py-2 border border-gray-600 text-slate-300 rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 transition duration-150 ease-in-out"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={saveUserChanges}
                                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition duration-150 ease-in-out"
                                >
                                    Save Changes
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Status Change Modal */}
            {showStatusChangeModal && statusChangeUser && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-card rounded-lg shadow-xl w-full max-w-md">
                        <div className="p-6">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-lg font-medium text-slate-200">Change Employee Status</h3>
                                <button
                                    onClick={() => {
                                        setShowStatusChangeModal(false);
                                        setStatusChangeUser(null);
                                        setNewStatus('');
                                        setStatusChangeReason('');
                                        setError('');
                                    }}
                                    className="text-slate-400 hover:text-slate-200"
                                >
                                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>

                            <div className="mb-4">
                                <p className="text-sm text-slate-300 mb-2">
                                    <strong>Employee:</strong> {statusChangeUser.name}
                                </p>
                                <p className="text-sm text-slate-300 mb-4">
                                    <strong>Current Status:</strong> <span className="capitalize">{statusChangeUser.employeeStatus || 'Not set'}</span>
                                </p>
                            </div>

                            {error && (
                                <div className="mb-4 p-3 bg-red-900/30 text-red-300 rounded-md text-sm">
                                    {error}
                                </div>
                            )}

                            <div className="mb-4">
                                <label className="block text-sm font-medium text-slate-300 mb-2">New Status</label>
                                <select
                                    value={newStatus}
                                    onChange={(e) => setNewStatus(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-200 bg-card"
                                >
                                    <option value="">Select New Status</option>
                                    <option value="permanent">Permanent</option>
                                    <option value="probation">Probation</option>
                                    <option value="intern">Intern</option>
                                </select>
                            </div>

                            <div className="mb-6">
                                <label className="block text-sm font-medium text-slate-300 mb-2">Reason for Change (Optional)</label>
                                <textarea
                                    value={statusChangeReason}
                                    onChange={(e) => setStatusChangeReason(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-200 bg-card"
                                    rows="3"
                                    placeholder="Enter reason for status change..."
                                />
                            </div>

                            <div className="flex justify-end space-x-3">
                                <button
                                    onClick={() => {
                                        setShowStatusChangeModal(false);
                                        setStatusChangeUser(null);
                                        setNewStatus('');
                                        setStatusChangeReason('');
                                        setError('');
                                    }}
                                    className="px-4 py-2 border border-gray-600 text-slate-300 rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 transition duration-150 ease-in-out"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleStatusChange}
                                    className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 transition duration-150 ease-in-out"
                                >
                                    Update Status
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Joined Date Change Modal */}
            {showJoinedDateModal && joinedDateUser && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-card rounded-lg shadow-xl w-full max-w-md">
                        <div className="p-6">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-lg font-medium text-slate-200">Change Joined Date</h3>
                                <button
                                    onClick={() => {
                                        setShowJoinedDateModal(false);
                                        setJoinedDateUser(null);
                                        setNewJoinedDate('');
                                        setJoinedDateReason('');
                                        setError('');
                                    }}
                                    className="text-slate-400 hover:text-slate-200"
                                >
                                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>

                            <div className="mb-4">
                                <p className="text-sm text-slate-300 mb-2">
                                    <strong>Employee:</strong> {joinedDateUser.name}
                                </p>
                                <p className="text-sm text-slate-300 mb-4">
                                    <strong>Current Joined Date:</strong> {joinedDateUser.joinedDate ? new Date(joinedDateUser.joinedDate).toLocaleDateString() : 'Not set'}
                                </p>
                                <p className="text-sm text-slate-300 mb-4">
                                    <strong>Current Next Evaluation:</strong> {joinedDateUser.nextEvaluationDate ? new Date(joinedDateUser.nextEvaluationDate).toLocaleDateString() : 'Not set'}
                                </p>
                            </div>

                            {error && (
                                <div className="mb-4 p-3 bg-red-900/30 text-red-300 rounded-md text-sm">
                                    {error}
                                </div>
                            )}

                            <div className="mb-4">
                                <label className="block text-sm font-medium text-slate-300 mb-2">New Joined Date</label>
                                <input
                                    type="date"
                                    value={newJoinedDate}
                                    onChange={(e) => setNewJoinedDate(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-200 bg-card"
                                />
                            </div>

                            <div className="mb-6">
                                <label className="block text-sm font-medium text-slate-300 mb-2">Reason for Change (Optional)</label>
                                <textarea
                                    value={joinedDateReason}
                                    onChange={(e) => setJoinedDateReason(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-200 bg-card"
                                    rows="3"
                                    placeholder="Enter reason for joined date change..."
                                />
                            </div>

                            <div className="bg-yellow-900/30 border border-yellow-600 rounded-md p-3 mb-4">
                                <p className="text-sm text-yellow-300">
                                    <strong>Note:</strong> Changing the joined date will automatically recalculate the next performance evaluation date (3 months from new joined date).
                                </p>
                            </div>

                            <div className="flex justify-end space-x-3">
                                <button
                                    onClick={() => {
                                        setShowJoinedDateModal(false);
                                        setJoinedDateUser(null);
                                        setNewJoinedDate('');
                                        setJoinedDateReason('');
                                        setError('');
                                    }}
                                    className="px-4 py-2 border border-gray-600 text-slate-300 rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 transition duration-150 ease-in-out"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleJoinedDateChange}
                                    className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 transition duration-150 ease-in-out"
                                >
                                    Update Joined Date
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {showDeleteConfirm && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-card rounded-lg shadow-xl w-full max-w-md">
                        <div className="p-6">
                            <div className="flex items-center mb-4">
                                <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-red-100">
                                    <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                                    </svg>
                                </div>
                            </div>
                            <div className="text-center">
                                <h3 className="text-lg font-medium text-slate-200 mb-2">Delete User</h3>
                                <p className="text-sm text-slate-400 mb-4">
                                    Are you sure you want to delete <strong>{showDeleteConfirm.name}</strong>? This action will mark the user as deleted and cannot be undone.
                                </p>
                                <div className="flex justify-center space-x-3">
                                    <button
                                        onClick={() => setShowDeleteConfirm(null)}
                                        className="px-4 py-2 border border-gray-600 text-slate-300 rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 transition duration-150 ease-in-out"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={() => handleDeleteUser(showDeleteConfirm.id)}
                                        className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 transition duration-150 ease-in-out"
                                    >
                                        Delete User
                                    </button>
                                </div>
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
                            <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Email</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Department</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Employee #</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Manager</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="bg-card divide-y divide-gray-700">
                        {filteredUsers.filter(user => !user.deleted).map(user => (
                            <tr key={user.id}>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-200">
                                    <div>
                                        <div className="font-medium">{user.name}</div>
                                        <div className="text-xs text-slate-400">{user.designation || 'No designation'}</div>
                                    </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400">
                                    {user.email}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400">
                                    {user.department || 'Not assigned'}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400">
                                    <input
                                        type="text"
                                        value={user.employeeNumber || ''}
                                        onChange={(e) => handleFieldUpdate(user.id, 'employeeNumber', e.target.value)}
                                        className="block w-full px-2 py-1 text-xs border-gray-600 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 rounded-md text-slate-200 bg-card"
                                        placeholder="Enter ID"
                                    />
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400">
                                    {user.managerId ?
                                        managers.find(m => m.id === user.managerId)?.name || 'Unknown Manager'
                                        : 'No Manager'
                                    }
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400">
                                    <div className="flex space-x-2">
                                        <button
                                            onClick={() => openEditModal(user)}
                                            className="text-blue-400 hover:text-blue-300 text-xs"
                                            title="Edit User"
                                        >
                                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                            </svg>
                                        </button>
                                        <button
                                            onClick={() => openStatusChangeModal(user)}
                                            className="text-green-400 hover:text-green-300 text-xs"
                                            title="Change Status"
                                        >
                                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                        </button>
                                        <button
                                            onClick={() => openJoinedDateModal(user)}
                                            className="text-purple-400 hover:text-purple-300 text-xs"
                                            title="Change Joined Date"
                                        >
                                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                            </svg>
                                        </button>
                                        {user.role !== 'Admin' && (
                                            <button
                                                onClick={() => setShowDeleteConfirm(user)}
                                                className="text-red-400 hover:text-red-300 text-xs"
                                                title="Delete User"
                                            >
                                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                </svg>
                                            </button>
                                        )}
                                    </div>
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
