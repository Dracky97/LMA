import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../context/AuthContext';
import { getFirestore, collection, onSnapshot, doc, updateDoc, getDoc, addDoc } from 'firebase/firestore';
import { app } from '../../lib/firebase-client';
import ManagerRequestsTable from '../ManagerRequestsTable';
import LeaveHistoryTable from '../LeaveHistoryTable';
import LeaveRequestModal from '../LeaveRequestModal';
import MyLeaveSection from '../MyLeaveSection';
import LeavePolicyInfo, { LeavePolicyReference } from '../LeavePolicyInfo';
import { LEAVE_TYPE_MAP, validateLeaveType, LEAVE_TYPES } from '../../lib/leaveTypes';
import { calculateLeaveBalances, LEAVE_CONFIG } from '../../lib/leavePolicy';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

const db = getFirestore(app);

// Leave type mapping is now imported from shared configuration

export default function HRManagerDashboard() {
    const { userData } = useAuth();
    const router = useRouter();
    const [allRequests, setAllRequests] = useState([]);
    const [users, setUsers] = useState({});
    const [filteredUsers, setFilteredUsers] = useState({});
    const [searchTerm, setSearchTerm] = useState('');
    const [message, setMessage] = useState(null);
    const [activeTab, setActiveTab] = useState('requests');
    const [showLeaveModal, setShowLeaveModal] = useState(false);
    const [activeReportTab, setActiveReportTab] = useState('generate');
    const [monthlyReport, setMonthlyReport] = useState(null);
    const [isGeneratingReport, setIsGeneratingReport] = useState(false);
    const [editingUser, setEditingUser] = useState(null);
    const [showEditBalanceModal, setShowEditBalanceModal] = useState(false);
    const [editBalanceData, setEditBalanceData] = useState({});
    const [manualLeaveData, setManualLeaveData] = useState({});
    const [isSubmittingManualLeave, setIsSubmittingManualLeave] = useState(false);
    const [customReportStartDate, setCustomReportStartDate] = useState('');
    const [customReportEndDate, setCustomReportEndDate] = useState('');
    const [isResettingShortLeave, setIsResettingShortLeave] = useState(false);
    const [editingJoinedDate, setEditingJoinedDate] = useState(null);
    const [newJoinedDate, setNewJoinedDate] = useState('');
    const [isCalculatingBalances, setIsCalculatingBalances] = useState(false);

    useEffect(() => {
        const usersUnsubscribe = onSnapshot(collection(db, 'users'), (snapshot) => {
            const usersData = {};
            snapshot.forEach(doc => {
                usersData[doc.id] = {
                    ...doc.data(),
                    uid: doc.id,
                    id: doc.id
                };
            });
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

    // Filter and sort users based on search term
    useEffect(() => {
        let usersArray = Object.values(users);

        // Sort users by employee number (ascending)
        usersArray.sort((a, b) => {
            const empNumA = a.employeeNumber || '';
            const empNumB = b.employeeNumber || '';

            // Handle empty employee numbers - push them to the end
            if (!empNumA && !empNumB) return 0;
            if (!empNumA) return 1;
            if (!empNumB) return -1;

            // Compare numerically if both are numbers, otherwise alphabetically
            const numA = parseInt(empNumA);
            const numB = parseInt(empNumB);

            if (!isNaN(numA) && !isNaN(numB)) {
                return numA - numB;
            } else {
                return empNumA.localeCompare(empNumB);
            }
        });

        if (!searchTerm.trim()) {
            // Convert back to object format with proper keys
            const sortedWithKeys = {};
            usersArray.forEach(user => {
                const key = user.uid || user.id;
                sortedWithKeys[key] = user;
            });
            setFilteredUsers(sortedWithKeys);
        } else {
            const filtered = usersArray.filter(user => {
                const searchLower = searchTerm.toLowerCase();
                return (
                    user.name?.toLowerCase().includes(searchLower) ||
                    user.department?.toLowerCase().includes(searchLower) ||
                    user.employeeNumber?.toLowerCase().includes(searchLower) ||
                    user.email?.toLowerCase().includes(searchLower) ||
                    (user.nextEvaluationDate && new Date(user.nextEvaluationDate).toLocaleDateString().toLowerCase().includes(searchLower))
                );
            });
            // Preserve the document ID as the key when filtering
            const filteredWithKeys = {};
            filtered.forEach(user => {
                const key = user.uid || user.id;
                filteredWithKeys[key] = user;
            });
            setFilteredUsers(filteredWithKeys);
        }
    }, [users, searchTerm]);

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
                // Final HR approval - handle based on leave type
                const isUnpaidLeave = request.type === 'Unpaid Leave';

                if (isUnpaidLeave) {
                    // Unpaid leave doesn't deduct from balances
                    await updateDoc(requestRef, {
                        hrManagerApproval: 'Approved',
                        status: 'Approved',
                        hrManagerActionBy: userData.name,
                        hrApprovalDate: new Date().toISOString(),
                        rejectionReason: ''
                    });
                    setMessage({ type: 'success', text: 'Unpaid leave request approved successfully. No balance deduction required.' });
                } else {
                    // Regular paid leave - deduct balance and complete the request
                    await updateDoc(requestRef, {
                        hrManagerApproval: 'Approved',
                        status: 'Approved',
                        hrManagerActionBy: userData.name,
                        hrApprovalDate: new Date().toISOString(),
                        rejectionReason: ''
                    });

                    // Deduct the leave balance (this can result in negative balance)
                    await deductLeaveBalance(request);
                    setMessage({ type: 'success', text: 'Leave request finally approved. Balance has been deducted.' });
                }
            } else {
                // HR rejection
                await updateDoc(requestRef, {
                    hrManagerApproval: 'Rejected',
                    status: 'Rejected',
                    hrManagerActionBy: userData.name,
                    hrApprovalDate: new Date().toISOString(),
                    rejectionReason: rejectionReason?.trim() || ''
                });
                setMessage({ type: 'success', text: 'Leave request rejected by HR.' });
            }
        } catch (error) {
            console.error("Error handling final approval:", error);
            setMessage({ type: 'error', text: `Error ${newStatus.toLowerCase()}ing leave request: ${error.message}` });
        }
    };

    const deductLeaveBalance = async (request) => {
        try {
            const userRef = doc(db, "users", request.userId);
            const userDoc = await getDoc(userRef);

            if (!userDoc.exists()) {
                throw new Error('User not found');
            }

            const currentData = userDoc.data();
            const leaveType = LEAVE_TYPE_MAP[request.type] || (request.type ? request.type.toLowerCase().replace(' ', '') : 'annualleave');

            if (!currentData.leaveBalance) {
                currentData.leaveBalance = {};
            }

            // Use leaveUnits if available, otherwise calculate from dates
            const duration = request.leaveUnits !== undefined && request.leaveUnits > 0
                ? request.leaveUnits
                : Math.ceil((request.endDate.toDate() - request.startDate.toDate()) / (1000 * 60 * 60 * 24));

            // For 'leave in-lieu' and 'other', there is no total allocation; approved requests should accumulate (add up)
            const isAccruingType = (leaveType === 'leave in-lieu' || leaveType === 'other');

            // Handle cross-utilization for Annual and Casual leave
            const updatedLeaveBalance = { ...currentData.leaveBalance };
            
            if (leaveType === 'annualLeave' || leaveType === 'casualLeave') {
                const primaryType = leaveType;
                const fallbackType = leaveType === 'annualLeave' ? 'casualLeave' : 'annualLeave';
                
                // Initialize balances if they don't exist
                if (!updatedLeaveBalance[primaryType]) updatedLeaveBalance[primaryType] = 0;
                if (!updatedLeaveBalance[fallbackType]) updatedLeaveBalance[fallbackType] = 0;
                
                const primaryBalance = updatedLeaveBalance[primaryType];
                const fallbackBalance = updatedLeaveBalance[fallbackType];
                
                if (primaryBalance >= duration) {
                    // Sufficient balance in primary leave type
                    updatedLeaveBalance[primaryType] = primaryBalance - duration;
                } else if (primaryBalance + fallbackBalance >= duration) {
                    // Cross-utilization needed
                    const remaining = duration - primaryBalance;
                    updatedLeaveBalance[primaryType] = 0;
                    updatedLeaveBalance[fallbackType] = fallbackBalance - remaining;
                    
                    // Log the cross-utilization for tracking
                    console.log(`Cross-utilization applied: ${remaining} days from ${fallbackType} to supplement ${primaryType}`);
                } else {
                    // Insufficient total balance - will go negative
                    updatedLeaveBalance[primaryType] = primaryBalance - duration;
                }
            } else {
                // Handle accruing types and other leave types
                const currentBalance = updatedLeaveBalance[leaveType] || 0;
                const newBalance = isAccruingType ? currentBalance + duration : currentBalance - duration;
                updatedLeaveBalance[leaveType] = newBalance;
            }

            console.log('HR Manager final approval - updating leave:', {
                leaveType,
                duration,
                isAccruingType,
                isPartialDay: request.isPartialDay,
                updatedLeaveBalance
            });

            // Check if any leave balance is going negative and update noPay status
            // Skip noPay status updates for manual entries (administrative adjustments)
            const isManualEntry = request.isManualEntry || false;
            const hasNegativeBalance = Object.values(updatedLeaveBalance).some(balance => balance < 0);
            const currentlyOnNoPay = currentData.noPayStatus || false;

            // Update noPay status if transitioning to/from negative balance (skip for manual entries)
            if (!isManualEntry) {
                if (hasNegativeBalance && !currentlyOnNoPay) {
                    // Starting no pay period
                    await updateDoc(userRef, {
                        leaveBalance: updatedLeaveBalance,
                        noPayStatus: true,
                        noPayStartDate: new Date().toISOString()
                    });
                } else if (!hasNegativeBalance && currentlyOnNoPay) {
                    // Ending no pay period
                    await updateDoc(userRef, {
                        leaveBalance: updatedLeaveBalance,
                        noPayStatus: false,
                        noPayEndDate: new Date().toISOString()
                    });
                } else {
                    // No status change needed
                    await updateDoc(userRef, {
                        leaveBalance: updatedLeaveBalance
                    });
                }
            } else {
                // Manual entry - just update balance without noPay status changes
                await updateDoc(userRef, {
                    leaveBalance: updatedLeaveBalance
                });
            }
        } catch (error) {
            console.error("Error deducting leave balance:", error);
            throw error;
        }
    };

    // Restore previously deducted/added leave for a cancelled request
    const restoreLeaveBalance = async (request) => {
        try {
            const userRef = doc(db, "users", request.userId);
            const userDoc = await getDoc(userRef);

            if (!userDoc.exists()) {
                throw new Error('User not found');
            }

            const currentData = userDoc.data();
            const leaveType = LEAVE_TYPE_MAP[request.type] || (request.type ? request.type.toLowerCase().replace(' ', '') : 'annualleave');

            if (!currentData.leaveBalance) {
                currentData.leaveBalance = {};
            }

            if (!currentData.leaveBalance.hasOwnProperty(leaveType)) {
                currentData.leaveBalance[leaveType] = 0;
            }

            const currentBalance = currentData.leaveBalance[leaveType];

            const duration = request.leaveUnits !== undefined && request.leaveUnits > 0
                ? request.leaveUnits
                : Math.ceil((request.endDate.toDate() - request.startDate.toDate()) / (1000 * 60 * 60 * 24));

            // For accruing types, approval ADDED balance, so cancellation should SUBTRACT it back.
            // For normal types, approval SUBTRACTED balance, so cancellation should ADD it back.
            const isAccruingType = (leaveType === 'leave in-lieu' || leaveType === 'other');
            const newBalance = isAccruingType ? currentBalance - duration : currentBalance + duration;

            console.log('Restoring leave due to cancellation:', {
                leaveType,
                duration,
                currentBalance,
                newBalance,
                isAccruingType
            });

            const updatedLeaveBalance = { ...currentData.leaveBalance, [leaveType]: newBalance };
            const hasNegativeBalance = Object.values(updatedLeaveBalance).some(balance => balance < 0);
            const currentlyOnNoPay = currentData.noPayStatus || false;

            if (hasNegativeBalance && !currentlyOnNoPay) {
                await updateDoc(userRef, {
                    [`leaveBalance.${leaveType}`]: newBalance,
                    noPayStatus: true,
                    noPayStartDate: new Date().toISOString()
                });
            } else if (!hasNegativeBalance && currentlyOnNoPay) {
                await updateDoc(userRef, {
                    [`leaveBalance.${leaveType}`]: newBalance,
                    noPayStatus: false,
                    noPayEndDate: new Date().toISOString()
                });
            } else {
                await updateDoc(userRef, {
                    [`leaveBalance.${leaveType}`]: newBalance
                });
            }
        } catch (error) {
            console.error("Error restoring leave balance:", error);
            throw error;
        }
    };

    // Handle cancellation by HR/Admin from history view
    const handleCancelLeave = async (request) => {
        try {
            if (!request || request.status !== 'Approved') {
                throw new Error('Only approved requests can be cancelled.');
            }

            const confirmMsg = `Cancel ${request.type} for ${users[request.userId]?.name || 'employee'} (${request.leaveUnits || Math.ceil((request.endDate.toDate() - request.startDate.toDate()) / (1000 * 60 * 60 * 24))} day(s))? This will restore the leave balance.`;
            if (typeof window !== 'undefined' && !window.confirm(confirmMsg)) {
                return;
            }

            const requestRef = doc(db, "leaveRequests", request.id);

            // Update request status to Cancelled
            await updateDoc(requestRef, {
                status: 'Cancelled',
                cancelledBy: userData?.name || 'HR/Admin',
                cancellationDate: new Date().toISOString()
            });

            // Restore balance accordingly
            await restoreLeaveBalance(request);

            setMessage({ type: 'success', text: 'Leave cancelled and balance restored successfully.' });
        } catch (error) {
            console.error('Error cancelling leave:', error);
            setMessage({ type: 'error', text: `Error cancelling leave: ${error.message}` });
        }
    };

    const handleManualLeaveSubmit = async (e) => {
        e.preventDefault();

        try {
            setIsSubmittingManualLeave(true);
            setMessage(null);

            const { employeeId, type, startDate, endDate, leaveUnits, reason } = manualLeaveData;

            if (!employeeId || !startDate || !endDate || leaveUnits === undefined || leaveUnits < 0) {
                throw new Error('Please fill in all required fields with valid values.');
            }

            // Ensure type has a default value
            const leaveType = type || 'Annual Leave';

            if (new Date(endDate) < new Date(startDate)) {
                throw new Error('End date must be after start date.');
            }

const selectedUser = users[employeeId];
            if (!selectedUser) {
                throw new Error('Selected employee not found.');
            }

            // Create the manual leave request
            const requestData = {
                userId: employeeId,
                userName: selectedUser.name || 'Unknown User', // Added fallback
                managerId: selectedUser.managerId || userData.uid,
                department: selectedUser.department || 'Unknown Department', // Added fallback
                type: leaveType,
                startDate: new Date(startDate),
                endDate: new Date(endDate),
                reason: reason || 'Manual leave entry by HR',
                status: 'Approved', // Directly approved
                appliedOn: new Date(),
                leaveUnits,
                totalDays: leaveUnits, // For simplicity, assume leaveUnits equals totalDays
                hrManagerApproval: 'Approved',
                hrManagerActionBy: userData.name || 'HR Manager',
                hrApprovalDate: new Date().toISOString(),
                isManualEntry: true,
                manualEntryBy: userData.name || 'HR Manager',
                manualEntryDate: new Date().toISOString()
            };

            // Add to leaveRequests collection
            await addDoc(collection(db, "leaveRequests"), requestData);

            // Deduct leave balance
            const requestForDeduction = {
                userId: employeeId,
                type,
                leaveUnits,
                startDate: new Date(startDate),
                endDate: new Date(endDate)
            };
            await deductLeaveBalance(requestForDeduction);

            setMessage({ type: 'success', text: `Manual leave entry created successfully for ${selectedUser.name}. Balance has been deducted.` });

            // Reset form
            setManualLeaveData({});

        } catch (error) {
            console.error('Error creating manual leave entry:', error);
            setMessage({ type: 'error', text: `Error creating manual leave entry: ${error.message}` });
        } finally {
            setIsSubmittingManualLeave(false);
        }
    };

    const generateCustomReport = async () => {
        if (!customReportStartDate || !customReportEndDate) {
            setMessage({ type: 'error', text: 'Please select both start and end dates for the custom report.' });
            return;
        }

        if (new Date(customReportEndDate) < new Date(customReportStartDate)) {
            setMessage({ type: 'error', text: 'End date must be after start date.' });
            return;
        }

        await generateMonthlyReport(true, customReportStartDate, customReportEndDate);
    };

    const resetShortLeaveBalances = async () => {
        try {
            setIsResettingShortLeave(true);
            setMessage(null);

            const confirmMsg = `This will reset short leave balance to 1 for ALL employees. This action cannot be undone. Continue?`;
            if (typeof window !== 'undefined' && !window.confirm(confirmMsg)) {
                return;
            }

            const batch = [];
            const currentDate = new Date().toISOString();

            // Update all users' short leave balance to 1
            for (const user of Object.values(users)) {
                const userRef = doc(db, "users", user.uid || user.id);
                batch.push(updateDoc(userRef, {
                    'leaveBalance.shortLeave': 1,
                    'leaveAllocations.shortLeave': 1,
                    shortLeaveLastReset: currentDate,
                    shortLeaveResetBy: userData.name
                }));
            }

            // Execute all updates
            await Promise.all(batch);

            setMessage({
                type: 'success',
                text: `Short leave balances have been reset to 1 for all ${Object.keys(users).length} employees.`
            });

        } catch (error) {
            console.error('Error resetting short leave balances:', error);
            setMessage({ type: 'error', text: `Error resetting short leave balances: ${error.message}` });
        } finally {
            setIsResettingShortLeave(false);
        }
    };
    
    const calculateAllLeaveBalances = async () => {
        try {
            setIsCalculatingBalances(true);
            setMessage(null);

            const confirmMsg = `This will calculate and update leave balances for ALL employees based on the new policy. This action cannot be undone. Continue?`;
            if (typeof window !== 'undefined' && !window.confirm(confirmMsg)) {
                return;
            }

            let successCount = 0;
            let errorCount = 0;
            const errors = [];

            // Process each employee
            for (const user of Object.values(users)) {
                try {
                    if (!user.joinedDate) {
                        errors.push(`${user.name}: No join date set`);
                        errorCount++;
                        continue;
                    }

                    // Get user's leave requests for current year
                    const userRequests = allRequests.filter(request => 
                        request.userId === user.uid && 
                        new Date(request.startDate).getFullYear() === new Date().getFullYear()
                    );

                    // Calculate balances based on policy
                    const calculatedBalances = calculateLeaveBalances({ ...user, joinDate: user.joinedDate }, userRequests);

                    // Extract balances and allocations from the calculation result
                    const leaveBalance = {
                        annualLeave: calculatedBalances.annualLeave,
                        casualLeave: calculatedBalances.casualLeave,
                        sickLeave: calculatedBalances.sickLeave,
                        shortLeave: calculatedBalances.shortLeave
                    };

                    const leaveAllocations = {
                        annualLeave: calculatedBalances.entitlements.annualLeave,
                        sickLeave: calculatedBalances.entitlements.sickLeave,
                        casualLeave: calculatedBalances.entitlements.casualLeave,
                        shortLeave: LEAVE_CONFIG.SHORT_LEAVE_MONTHLY_LIMIT * 12 // 36 hours annual allowance
                    };

                    const userRef = doc(db, "users", user.uid || user.id);
                    await updateDoc(userRef, {
                        leaveBalance: leaveBalance,
                        leaveAllocations: leaveAllocations,
                        lastBalanceCalculation: new Date().toISOString(),
                        balanceCalculationBy: userData.name
                    });

                    successCount++;
                } catch (error) {
                    console.error(`Error calculating balances for ${user.name}:`, error);
                    errors.push(`${user.name}: ${error.message}`);
                    errorCount++;
                }
            }

            let messageText = `Leave balance calculation completed. ${successCount} employees updated successfully.`;
            if (errorCount > 0) {
                messageText += ` ${errorCount} errors occurred.`;
            }
            if (errors.length > 0) {
                console.log('Calculation errors:', errors);
            }

            setMessage({
                type: errorCount === 0 ? 'success' : 'warning',
                text: messageText
            });

        } catch (error) {
            console.error('Error calculating leave balances:', error);
            setMessage({ type: 'error', text: `Error calculating leave balances: ${error.message}` });
        } finally {
            setIsCalculatingBalances(false);
        }
    };

    const pendingHRRequests = allRequests.filter(r => r.status === 'Pending HR Approval');
    const pendingFinalHRRequests = allRequests.filter(r => r.status === 'Pending HR Approval' && r.hrManagerApproval !== 'Approved');

    // Function to generate monthly report (25th to 25th or custom range)
    const generateMonthlyReport = async (useCustomRange = false, customStart = null, customEnd = null) => {
        setIsGeneratingReport(true);
        try {
            let startDate, endDate;

            if (useCustomRange && customStart && customEnd) {
                startDate = new Date(customStart);
                endDate = new Date(customEnd);
            } else {
                const now = new Date();
                const currentYear = now.getFullYear();
                const currentMonth = now.getMonth();

                // Calculate date range: 25th of previous month to 25th of current month
                startDate = new Date(currentYear, currentMonth - 1, 25);
                endDate = new Date(currentYear, currentMonth, 25);

                // If we're before the 25th of current month, adjust the range
                if (now.getDate() < 25) {
                    startDate.setMonth(currentMonth - 2);
                    endDate.setMonth(currentMonth - 1);
                    endDate.setDate(25);
                }
            }

            console.log('Generating report for period:', startDate.toISOString(), 'to', endDate.toISOString());

            // Filter requests within the date range
            const reportRequests = allRequests.filter(request => {
                if (!request.startDate) return false;
                const requestStart = request.startDate.toDate();
                return requestStart >= startDate && requestStart <= endDate;
            });

            // Group requests by department and leave type
            const departmentStats = {};
            const leaveTypeStats = {};
            const userStats = {};
            const noPayEmployees = [];

            reportRequests.forEach(request => {
                const user = users[request.userId];
                const department = user?.department || 'Unknown';
                const leaveType = request.type || 'Unknown';

                // Department statistics
                if (!departmentStats[department]) {
                    departmentStats[department] = { total: 0, approved: 0, rejected: 0, pending: 0 };
                }
                departmentStats[department].total++;

                if (request.status === 'Approved') departmentStats[department].approved++;
                else if (request.status === 'Rejected') departmentStats[department].rejected++;
                else departmentStats[department].pending++;

                // Leave type statistics
                if (!leaveTypeStats[leaveType]) {
                    leaveTypeStats[leaveType] = { total: 0, approved: 0, rejected: 0, pending: 0 };
                }
                leaveTypeStats[leaveType].total++;

                if (request.status === 'Approved') leaveTypeStats[leaveType].approved++;
                else if (request.status === 'Rejected') leaveTypeStats[leaveType].rejected++;
                else leaveTypeStats[leaveType].pending++;

                // User statistics
                if (!userStats[request.userId]) {
                    userStats[request.userId] = {
                        name: user?.name || 'Unknown',
                        department: department,
                        requests: []
                    };
                }
                userStats[request.userId].requests.push({
                    type: leaveType,
                    status: request.status,
                    startDate: request.startDate?.toDate(),
                    endDate: request.endDate?.toDate(),
                    duration: request.leaveUnits || Math.ceil((request.endDate?.toDate() - request.startDate?.toDate()) / (1000 * 60 * 60 * 24))
                });
            });

            // Check for employees with negative leave balances (no pay status)
            Object.values(users).forEach(user => {
                if (user.leaveBalance) {
                    const hasNegativeBalance = Object.values(user.leaveBalance).some(balance => balance < 0);
                    if (hasNegativeBalance) {
                        noPayEmployees.push({
                            id: user.uid || user.id,
                            employeeId: user.employeeNumber || user.id,
                            name: user.name,
                            department: user.department || 'N/A',
                            leaveBalance: user.leaveBalance,
                            noPayStatus: user.noPayStatus || false,
                            noPayStartDate: user.noPayStartDate,
                            noPayEndDate: user.noPayEndDate
                        });
                    }
                }
            });

            const report = {
                period: {
                    start: startDate,
                    end: endDate,
                    month: startDate.toLocaleString('default', { month: 'long', year: 'numeric' })
                },
                summary: {
                    totalRequests: reportRequests.length,
                    approvedRequests: reportRequests.filter(r => r.status === 'Approved').length,
                    rejectedRequests: reportRequests.filter(r => r.status === 'Rejected').length,
                    pendingRequests: reportRequests.filter(r => r.status === 'Pending HR Approval').length
                },
                departmentStats,
                leaveTypeStats,
                userStats,
                noPayEmployees,
                requests: reportRequests
            };

            setMonthlyReport(report);
            setActiveReportTab('view');
            setMessage({ type: 'success', text: 'Monthly report generated successfully.' });
        } catch (error) {
            console.error('Error generating monthly report:', error);
            setMessage({ type: 'error', text: `Error generating report: ${error.message}` });
        } finally {
            setIsGeneratingReport(false);
        }
    };

    // Function to download report as PDF
    const downloadReportAsPDF = async () => {
        if (!monthlyReport) return;

        try {
            setMessage({ type: 'info', text: 'Generating PDF report...' });

            // Create a new jsPDF instance
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pageWidth = pdf.internal.pageSize.getWidth();
            const pageHeight = pdf.internal.pageSize.getHeight();
            let yPosition = 20;

            // Helper function to add text with word wrapping
            const addWrappedText = (text, x, y, maxWidth, fontSize = 12) => {
                pdf.setFontSize(fontSize);
                const lines = pdf.splitTextToSize(text, maxWidth);
                pdf.text(lines, x, y);
                return lines.length * fontSize * 0.4; // Approximate line height
            };

            // Helper function to add new page if needed
            const checkAndAddPage = (requiredSpace) => {
                if (yPosition + requiredSpace > pageHeight - 20) {
                    pdf.addPage();
                    yPosition = 20;
                }
            };

            // Title
            pdf.setFontSize(20);
            pdf.setFont('helvetica', 'bold');
            pdf.text('Monthly Leave Report', pageWidth / 2, yPosition, { align: 'center' });
            yPosition += 15;

            // Report period
            pdf.setFontSize(12);
            pdf.setFont('helvetica', 'normal');
            const periodText = `${monthlyReport.period.month} (${monthlyReport.period.start.toLocaleDateString()} - ${monthlyReport.period.end.toLocaleDateString()})`;
            yPosition += addWrappedText(periodText, 20, yPosition, pageWidth - 40, 12) + 10;

            // Summary Statistics
            pdf.setFontSize(14);
            pdf.setFont('helvetica', 'bold');
            pdf.text('Summary Statistics', 20, yPosition);
            yPosition += 10;

            pdf.setFontSize(10);
            pdf.setFont('helvetica', 'normal');
            const summaryData = [
                ['Total Requests', monthlyReport.summary.totalRequests.toString()],
                ['Approved', monthlyReport.summary.approvedRequests.toString()],
                ['Rejected', monthlyReport.summary.rejectedRequests.toString()],
                ['Pending', monthlyReport.summary.pendingRequests.toString()]
            ];

            summaryData.forEach(([label, value]) => {
                checkAndAddPage(8);
                pdf.text(`${label}: ${value}`, 30, yPosition);
                yPosition += 8;
            });

            yPosition += 10;

            // No Pay Employees Section
            if (monthlyReport.noPayEmployees && monthlyReport.noPayEmployees.length > 0) {
                checkAndAddPage(15);
                pdf.setFontSize(14);
                pdf.setFont('helvetica', 'bold');
                pdf.text('Employees on No Pay Status', 20, yPosition);
                yPosition += 10;

                pdf.setFontSize(10);
                pdf.setFont('helvetica', 'normal');

                // Table headers
                pdf.text('Employee ID', 20, yPosition);
                pdf.text('Employee', 60, yPosition);
                pdf.text('Department', 100, yPosition);
                pdf.text('Leave Balances', 140, yPosition);
                pdf.text('No Pay Start', 190, yPosition);
                yPosition += 8;

                // Table data
                monthlyReport.noPayEmployees.forEach((employee) => {
                    checkAndAddPage(12);
                    pdf.text(employee.employeeId.substring(0, 10), 20, yPosition);
                    pdf.text(employee.name.substring(0, 15), 60, yPosition);
                    pdf.text(employee.department.substring(0, 15), 100, yPosition);

                    // Leave balances (only negative)
                    let balanceText = '';
                    Object.entries(employee.leaveBalance).filter(([type, balance]) => balance < 0).forEach(([type, balance]) => {
                        balanceText += `${type}: ${balance}, `;
                    });
                    balanceText = balanceText.slice(0, -2); // Remove last comma and space
                    pdf.text(balanceText.substring(0, 25), 140, yPosition);

                    // No pay start date
                    const noPayDate = employee.noPayStartDate ? new Date(employee.noPayStartDate).toLocaleDateString() : 'N/A';
                    pdf.text(noPayDate, 190, yPosition);
                    yPosition += 8;
                });

                yPosition += 10;
            }

            // Department Statistics
            checkAndAddPage(15);
            pdf.setFontSize(14);
            pdf.setFont('helvetica', 'bold');
            pdf.text('Department Statistics', 20, yPosition);
            yPosition += 10;

            pdf.setFontSize(10);
            pdf.setFont('helvetica', 'normal');

            // Table headers
            const tableStartY = yPosition;
            pdf.text('Department', 20, yPosition);
            pdf.text('Total', 80, yPosition);
            pdf.text('Approved', 100, yPosition);
            pdf.text('Rejected', 125, yPosition);
            pdf.text('Pending', 150, yPosition);
            pdf.text('Rate', 175, yPosition);
            yPosition += 8;

            // Table data
            Object.entries(monthlyReport.departmentStats).forEach(([department, stats]) => {
                checkAndAddPage(8);
                pdf.text(department, 20, yPosition);
                pdf.text(stats.total.toString(), 80, yPosition);
                pdf.text(stats.approved.toString(), 100, yPosition);
                pdf.text(stats.rejected.toString(), 125, yPosition);
                pdf.text(stats.pending.toString(), 150, yPosition);
                const approvalRate = stats.total > 0 ? Math.round((stats.approved / stats.total) * 100) : 0;
                pdf.text(`${approvalRate}%`, 175, yPosition);
                yPosition += 8;
            });

            yPosition += 10;

            // Detailed Request List
            checkAndAddPage(15);
            pdf.setFontSize(14);
            pdf.setFont('helvetica', 'bold');
            pdf.text('Detailed Request List', 20, yPosition);
            yPosition += 10;

            pdf.setFontSize(10);
            pdf.setFont('helvetica', 'normal');

            // Table headers for detailed list
            pdf.text('Employee', 20, yPosition);
            pdf.text('Type', 70, yPosition);
            pdf.text('Start Date', 100, yPosition);
            pdf.text('End Date', 130, yPosition);
            pdf.text('Duration', 160, yPosition);
            pdf.text('Status', 180, yPosition);
            yPosition += 8;

            // Table data for detailed list
            monthlyReport.requests.forEach((request) => {
                checkAndAddPage(8);
                const user = users[request.userId];
                const employeeName = user?.name || 'Unknown';
                const leaveType = request.type || 'Unknown';
                const startDate = request.startDate?.toDate().toLocaleDateString() || 'N/A';
                const endDate = request.endDate?.toDate().toLocaleDateString() || 'N/A';
                const duration = request.leaveUnits || Math.ceil((request.endDate?.toDate() - request.startDate?.toDate()) / (1000 * 60 * 60 * 24));
                const status = request.status || 'Unknown';

                pdf.text(employeeName.substring(0, 15), 20, yPosition);
                pdf.text(leaveType.substring(0, 15), 70, yPosition);
                pdf.text(startDate, 100, yPosition);
                pdf.text(endDate, 130, yPosition);
                pdf.text(`${duration} days`, 160, yPosition);
                pdf.text(status, 180, yPosition);
                yPosition += 8;
            });

            // Footer
            const totalPages = pdf.getNumberOfPages();
            for (let i = 1; i <= totalPages; i++) {
                pdf.setPage(i);
                pdf.setFontSize(8);
                pdf.setFont('helvetica', 'normal');
                pdf.text(`Generated on ${new Date().toLocaleDateString()}`, 20, pageHeight - 10);
                pdf.text(`Page ${i} of ${totalPages}`, pageWidth - 30, pageHeight - 10);
            }

            // Save the PDF
            const fileName = `Leave_Report_${monthlyReport.period.month.replace(' ', '_')}_${new Date().getFullYear()}.pdf`;
            pdf.save(fileName);

            setMessage({ type: 'success', text: 'PDF report downloaded successfully.' });
        } catch (error) {
            console.error('Error generating PDF:', error);
            setMessage({ type: 'error', text: `Error generating PDF: ${error.message}` });
        }
    };

    // Function to handle profile navigation
    const handleProfileClick = (userId) => {
        router.push(`/profile/${userId}`);
    };

    // Function to format leave balance display
    const formatLeaveBalance = (balance) => {
        if (balance === undefined || balance === null) return '0';
        // Show decimals only if needed (e.g., 7.5 instead of 7.50, but 7 instead of 7.0)
        return balance % 1 === 0 ? balance.toString() : balance.toFixed(1);
    };

    // Function to open edit balance modal
    const openEditBalanceModal = (user) => {
        console.log('=== HR MANAGER OPENING EDIT MODAL ===');
        console.log('User name:', user.name);
        console.log('User leaveBalance:', user.leaveBalance);
        console.log('User leaveAllocations:', user.leaveAllocations);

        setEditingUser(user);
        setEditBalanceData({
            // Current leave balances (remaining days)
            annualLeave: user.leaveBalance?.annualLeave || 0,
            sickLeave: user.leaveBalance?.sickLeave || 0,
            casualLeave: user.leaveBalance?.casualLeave || 0,
            shortLeave: user.leaveBalance?.shortLeave || 0,
            maternityLeave: user.leaveBalance?.maternityLeave || 0,
            paternityLeave: user.leaveBalance?.paternityLeave || 0,
            'leave in-lieu': user.leaveBalance?.['leave in-lieu'] || 0,
            other: user.leaveBalance?.other || 0,
            // Total leave allocations (custom totals per user) - no defaults
            annualLeaveTotal: user.leaveAllocations?.annualLeave ?? 0,
            sickLeaveTotal: user.leaveAllocations?.sickLeave ?? 0,
            casualLeaveTotal: user.leaveAllocations?.casualLeave ?? 0,
            shortLeaveTotal: user.leaveAllocations?.shortLeave ?? 0,
            maternityLeaveTotal: user.leaveAllocations?.maternityLeave ?? 0,
            paternityLeaveTotal: user.leaveAllocations?.paternityLeave ?? 0
        });
        setShowEditBalanceModal(true);
    };

    // Function to handle leave balance changes
    const handleBalanceChange = (leaveType, value) => {
        setEditBalanceData(prev => ({
            ...prev,
            [leaveType]: parseFloat(value) || 0
        }));
    };

    // Function to save leave balance changes
    const saveBalanceChanges = async () => {
        try {
            console.log('=== HR MANAGER SAVE START ===');
            console.log('Editing user:', editingUser);
            console.log('Edit balance data:', editBalanceData);

            if (!editingUser) {
                throw new Error('No user selected for editing');
            }

            const userId = editingUser.uid || editingUser.id;
            if (!userId) {
                throw new Error('User ID not found');
            }

            const userRef = doc(db, "users", userId);
            console.log('User document reference:', userRef.path);

            // Prepare current leave balances (remaining days)
            const leaveBalance = {
                annualLeave: editBalanceData.annualLeave || 0,
                sickLeave: editBalanceData.sickLeave || 0,
                casualLeave: editBalanceData.casualLeave || 0,
                shortLeave: editBalanceData.shortLeave || 0,
                maternityLeave: editBalanceData.maternityLeave || 0,
                paternityLeave: editBalanceData.paternityLeave || 0,
                'leave in-lieu': editBalanceData['leave in-lieu'] || 0,
                unpaidLeave: editBalanceData.unpaidLeave || 0,
                other: editBalanceData.other || 0
            };

            // Prepare total leave allocations (custom totals per user)
            // 'leave in-lieu' and 'other' do not have total allocations; exclude them from allocations
            const leaveAllocations = {
                annualLeave: editBalanceData.annualLeaveTotal || 0,
                sickLeave: editBalanceData.sickLeaveTotal || 0,
                casualLeave: editBalanceData.casualLeaveTotal || 0,
                shortLeave: editBalanceData.shortLeaveTotal || 0,
                maternityLeave: editBalanceData.maternityLeaveTotal || 0,
                paternityLeave: editBalanceData.paternityLeaveTotal || 0
            };

            console.log('Final data to update:', { leaveBalance, leaveAllocations });

            await updateDoc(userRef, {
                leaveBalance,
                leaveAllocations
            });

            console.log('✅ HR Manager update successful');
            setMessage({ type: 'success', text: `Leave balances and allocations updated successfully for ${editingUser.name}` });
            setShowEditBalanceModal(false);
            setEditingUser(null);
        } catch (error) {
            console.error("❌ Error updating leave balances:", error);
            console.error("Error code:", error.code);
            console.error("Error message:", error.message);
            console.error("Error stack:", error.stack);
            setMessage({ type: 'error', text: `Error updating leave balances: ${error.message}` });
        }
    };

    // Function to handle joined date editing
    const handleEditJoinedDate = (user) => {
        setEditingJoinedDate(user);
        setNewJoinedDate(user.joinedDate ? new Date(user.joinedDate).toISOString().split('T')[0] : '');
    };

    // Function to cancel joined date editing
    const handleCancelJoinedDateEdit = () => {
        setEditingJoinedDate(null);
        setNewJoinedDate('');
    };

    // Function to save joined date changes
    const saveJoinedDateChanges = async () => {
        try {
            if (!editingJoinedDate) {
                throw new Error('No user selected for editing');
            }

            const userId = editingJoinedDate.uid || editingJoinedDate.id;
            if (!userId) {
                throw new Error('User ID not found');
            }

            const userRef = doc(db, "users", userId);
            
            await updateDoc(userRef, {
                joinedDate: newJoinedDate ? new Date(newJoinedDate).toISOString() : null
            });

            setMessage({ type: 'success', text: `Joined date updated successfully for ${editingJoinedDate.name}` });
            setEditingJoinedDate(null);
            setNewJoinedDate('');
        } catch (error) {
            console.error("Error updating joined date:", error);
            setMessage({ type: 'error', text: `Error updating joined date: ${error.message}` });
        }
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
                        Requests for Final Approval ({pendingFinalHRRequests.length})
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
                    <button
                        onClick={() => setActiveTab('reports')}
                        className={`py-4 px-1 border-b-2 font-medium text-sm ${
                            activeTab === 'reports'
                                ? 'border-blue-500 text-blue-400'
                                : 'border-transparent text-slate-500 hover:text-slate-300 hover:border-slate-300'
                        }`}
                    >
                        Monthly Reports
                    </button>
                    <button
                        onClick={() => setActiveTab('manual')}
                        className={`py-4 px-1 border-b-2 font-medium text-sm ${
                            activeTab === 'manual'
                                ? 'border-blue-500 text-blue-400'
                                : 'border-transparent text-slate-500 hover:text-slate-300 hover:border-slate-300'
                        }`}
                    >
                        Manual Leave Entry
                    </button>
                    <button
                        onClick={() => setActiveTab('shortleave')}
                        className={`py-4 px-1 border-b-2 font-medium text-sm ${
                            activeTab === 'shortleave'
                                ? 'border-blue-500 text-blue-400'
                                : 'border-transparent text-slate-500 hover:text-slate-300 hover:border-slate-300'
                        }`}
                    >
                        Short Leave Reset
                    </button>
                    <button
                        onClick={() => setActiveTab('policy')}
                        className={`py-4 px-1 border-b-2 font-medium text-sm ${
                            activeTab === 'policy'
                                ? 'border-blue-500 text-blue-400'
                                : 'border-transparent text-slate-500 hover:text-slate-300 hover:border-slate-300'
                        }`}
                    >
                        Leave Policy
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
                        <ManagerRequestsTable requests={pendingFinalHRRequests} users={users} onUpdate={handleFinalApproval} isHRView={true} />
                    </div>
                )}
                
                {activeTab === 'balances' && (
                    <div className="p-6">
                        {/* Search Bar */}
                        <div className="mb-6">
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <svg className="h-5 w-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                    </svg>
                                </div>
                                <input
                                    type="text"
                                    placeholder="Search by name, department, employee number, email, or evaluation date..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="block w-full pl-10 pr-3 py-2 border border-gray-600 rounded-md leading-5 bg-muted text-slate-200 placeholder-slate-400 focus:outline-none focus:bg-card focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                                />
                            </div>
                            {searchTerm && (
                                <div className="mt-2 text-sm text-slate-400">
                                    Showing {Object.keys(filteredUsers).length} of {Object.keys(users).length} users
                                </div>
                            )}
                        </div>

                        <div className="overflow-x-scroll h-96 overflow-y-auto">
                            <table className="min-w-full divide-y divide-gray-700">
                                <thead className="bg-muted">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Actions</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Employee</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Department</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Joined Date</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Next Evaluation</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Annual Leave</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Sick Leave</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Casual Leave</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Short Leave</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Maternity Leave</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Paternity Leave</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Leave in-lieu</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Unpaid Leave</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Other</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-card divide-y divide-gray-700">
                                    {Object.values(filteredUsers).map(user => (
                                        <tr key={user.uid || user.id} className="hover:bg-muted/50 transition-colors">
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400">
                                                <button
                                                    onClick={() => openEditBalanceModal(user)}
                                                    className="text-blue-400 hover:text-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-card rounded p-1"
                                                    title="Edit Leave Balances"
                                                >
                                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                    </svg>
                                                </button>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                                                <button
                                                    onClick={() => handleProfileClick(user.uid || user.id)}
                                                    className="font-medium text-blue-400 hover:text-blue-300 hover:underline focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-card rounded"
                                                >
                                                    {user.name}
                                                </button>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400">{user.department || 'N/A'}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400">
                                                {editingJoinedDate?.uid === user.uid || editingJoinedDate?.id === user.id ? (
                                                    <div className="flex items-center space-x-2">
                                                        <input
                                                            type="date"
                                                            value={newJoinedDate}
                                                            onChange={(e) => setNewJoinedDate(e.target.value)}
                                                            className="bg-card text-slate-200 border border-gray-600 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                                                        />
                                                        <button
                                                            onClick={saveJoinedDateChanges}
                                                            className="bg-green-600 text-white px-2 py-1 rounded text-xs hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500"
                                                        >
                                                            Save
                                                        </button>
                                                        <button
                                                            onClick={handleCancelJoinedDateEdit}
                                                            className="bg-gray-600 text-white px-2 py-1 rounded text-xs hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500"
                                                        >
                                                            Cancel
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center space-x-2">
                                                        <span>{user.joinedDate ? new Date(user.joinedDate).toLocaleDateString() : 'Not set'}</span>
                                                        <button
                                                            onClick={() => handleEditJoinedDate(user)}
                                                            className="text-blue-400 hover:text-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-card rounded p-1"
                                                            title="Edit Joined Date"
                                                        >
                                                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                            </svg>
                                                        </button>
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400">
                                                {user.nextEvaluationDate ? new Date(user.nextEvaluationDate).toLocaleDateString() : 'Not set'}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400">{formatLeaveBalance(user.leaveBalance?.annualLeave)}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400">{formatLeaveBalance(user.leaveBalance?.sickLeave)}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400">{formatLeaveBalance(user.leaveBalance?.casualLeave)}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400">{formatLeaveBalance(user.leaveBalance?.shortLeave)}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400">{formatLeaveBalance(user.leaveBalance?.maternityLeave)}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400">{formatLeaveBalance(user.leaveBalance?.paternityLeave)}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400">{formatLeaveBalance(user.leaveBalance?.['leave in-lieu'])}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400">{formatLeaveBalance(user.leaveBalance?.unpaidLeave || 0)}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400">{formatLeaveBalance(user.leaveBalance?.other)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {Object.keys(filteredUsers).length === 0 && searchTerm && (
                                <div className="text-center py-8 text-slate-400">
                                    No users found matching "{searchTerm}"
                                </div>
                            )}
                        </div>
                    </div>
                )}
                
                {activeTab === 'history' && (
                    <div className="p-6">
                        <LeaveHistoryTable
                            requests={allRequests}
                            users={users}
                            isAdminView={true}
                            canCancel={true}
                            onCancel={handleCancelLeave}
                        />
                    </div>
                )}

                {activeTab === 'reports' && (
                    <div className="p-6">
                        <div className="border-b border-gray-700 mb-6">
                            <nav className="-mb-px flex space-x-8">
                                <button
                                    onClick={() => setActiveReportTab('generate')}
                                    className={`py-2 px-1 border-b-2 font-medium text-sm ${
                                        activeReportTab === 'generate'
                                            ? 'border-blue-500 text-blue-400'
                                            : 'border-transparent text-slate-500 hover:text-slate-300 hover:border-slate-300'
                                    }`}
                                >
                                    Generate Report
                                </button>
                                <button
                                    onClick={() => setActiveReportTab('view')}
                                    className={`py-2 px-1 border-b-2 font-medium text-sm ${
                                        activeReportTab === 'view'
                                            ? 'border-blue-500 text-blue-400'
                                            : 'border-transparent text-slate-500 hover:text-slate-300 hover:border-slate-300'
                                    }`}
                                    disabled={!monthlyReport}
                                >
                                    View Report
                                </button>
                            </nav>
                        </div>

                        {activeReportTab === 'generate' && (
                            <div className="space-y-6">
                                <div className="bg-muted p-6 rounded-lg">
                                    <h3 className="text-lg font-medium text-slate-200 mb-4">Monthly Report Generator</h3>
                                    
                                    <button
                                        onClick={() => generateMonthlyReport(false)}
                                        disabled={isGeneratingReport}
                                        className="bg-blue-600 text-white px-6 py-3 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed mr-4"
                                    >
                                        {isGeneratingReport ? 'Generating Report...' : 'Generate Monthly Report'}
                                    </button>
                                </div>

                                <div className="bg-muted p-6 rounded-lg">
                                    <h3 className="text-lg font-medium text-slate-200 mb-4">Custom Date Range Report</h3>
                                    <p className="text-slate-400 mb-6">
                                        Generate a report for a specific date range of your choice.
                                    </p>
                                    <div className="grid grid-cols-2 gap-4 mb-4">
                                        <div>
                                            <label className="block text-sm font-medium text-slate-300 mb-1">Start Date</label>
                                            <input
                                                type="date"
                                                value={customReportStartDate}
                                                onChange={(e) => setCustomReportStartDate(e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-600 rounded-md bg-card text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-300 mb-1">End Date</label>
                                            <input
                                                type="date"
                                                value={customReportEndDate}
                                                onChange={(e) => setCustomReportEndDate(e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-600 rounded-md bg-card text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            />
                                        </div>
                                    </div>
                                    <button
                                        onClick={generateCustomReport}
                                        disabled={isGeneratingReport || !customReportStartDate || !customReportEndDate}
                                        className="bg-green-600 text-white px-6 py-3 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {isGeneratingReport ? 'Generating Report...' : 'Generate Custom Report'}
                                    </button>
                                </div>
                            </div>
                        )}

                        {activeReportTab === 'view' && monthlyReport && (
                            <div className="space-y-6">
                                <div className="bg-muted p-6 rounded-lg">
                                    <div className="flex justify-between items-start mb-4">
                                        <div>
                                            <h3 className="text-lg font-medium text-slate-200">
                                                Monthly Report - {monthlyReport.period.month}
                                            </h3>
                                            <p className="text-slate-400 mt-1">
                                                Report Period: {monthlyReport.period.start.toLocaleDateString()} to {monthlyReport.period.end.toLocaleDateString()}
                                            </p>
                                        </div>
                                        <button
                                            onClick={downloadReportAsPDF}
                                            className="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 flex items-center space-x-2"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                            </svg>
                                            <span>Download PDF</span>
                                        </button>
                                    </div>

                                    {/* Summary Statistics */}
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                                        <div className="bg-blue-900/30 p-4 rounded-lg">
                                            <div className="text-2xl font-bold text-blue-400">{monthlyReport.summary.totalRequests}</div>
                                            <div className="text-slate-400">Total Requests</div>
                                        </div>
                                        <div className="bg-green-900/30 p-4 rounded-lg">
                                            <div className="text-2xl font-bold text-green-400">{monthlyReport.summary.approvedRequests}</div>
                                            <div className="text-slate-400">Approved</div>
                                        </div>
                                        <div className="bg-red-900/30 p-4 rounded-lg">
                                            <div className="text-2xl font-bold text-red-400">{monthlyReport.summary.rejectedRequests}</div>
                                            <div className="text-slate-400">Rejected</div>
                                        </div>
                                        <div className="bg-yellow-900/30 p-4 rounded-lg">
                                            <div className="text-2xl font-bold text-yellow-400">{monthlyReport.summary.pendingRequests}</div>
                                            <div className="text-slate-400">Pending</div>
                                        </div>
                                    </div>

                                    {/* Department Statistics */}
                                    <div className="mb-8">
                                        <h4 className="text-md font-medium text-slate-200 mb-4">Department Statistics</h4>
                                        <div className="overflow-x-scroll h-64 overflow-y-auto">
                                            <table className="min-w-full divide-y divide-gray-700">
                                                <thead className="bg-muted">
                                                    <tr>
                                                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Department</th>
                                                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Total</th>
                                                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Approved</th>
                                                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Rejected</th>
                                                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Pending</th>
                                                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Approval Rate</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="bg-card divide-y divide-gray-700">
                                                    {Object.entries(monthlyReport.departmentStats).map(([department, stats]) => (
                                                        <tr key={department}>
                                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-200">{department}</td>
                                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400">{stats.total}</td>
                                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-green-400">{stats.approved}</td>
                                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-red-400">{stats.rejected}</td>
                                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-yellow-400">{stats.pending}</td>
                                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400">
                                                                {stats.total > 0 ? Math.round((stats.approved / stats.total) * 100) : 0}%
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>


                                    {/* No Pay Employees Section */}
                                    {monthlyReport.noPayEmployees && monthlyReport.noPayEmployees.length > 0 && (
                                        <div className="mb-8">
                                            <h4 className="text-md font-medium text-slate-200 mb-4">Employees on No Pay Status</h4>
                                            <div className="overflow-x-scroll h-64 overflow-y-auto">
                                                <table className="min-w-full divide-y divide-gray-700">
                                                    <thead className="bg-muted">
                                                        <tr>
                                                            <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Employee ID</th>
                                                            <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Employee</th>
                                                            <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Department</th>
                                                            <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Leave Balances</th>
                                                            <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">No Pay Start</th>
                                                            <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Status</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="bg-card divide-y divide-gray-700">
                                                        {monthlyReport.noPayEmployees.map((employee) => (
                                                            <tr key={employee.id}>
                                                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-200">{employee.employeeId}</td>
                                                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-200">{employee.name}</td>
                                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400">{employee.department}</td>
                                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400">
                                                                    <div className="space-y-1">
                                                                        {Object.entries(employee.leaveBalance).filter(([type, balance]) => balance < 0).map(([type, balance]) => (
                                                                            <div key={type} className={`text-xs ${balance < 0 ? 'text-red-400 font-semibold' : 'text-slate-400'}`}>
                                                                                {type}: {formatLeaveBalance(balance)}
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </td>
                                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400">
                                                                    {employee.noPayStartDate ? new Date(employee.noPayStartDate).toLocaleDateString() : 'N/A'}
                                                                </td>
                                                                <td className="px-6 py-4 whitespace-nowrap">
                                                                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                                                        employee.noPayStatus ? 'bg-red-900/30 text-red-400' : 'bg-yellow-900/30 text-yellow-400'
                                                                    }`}>
                                                                        {employee.noPayStatus ? 'On No Pay' : 'Negative Balance'}
                                                                    </span>
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    )}

                                    {/* Detailed Request List */}
                                    <div>
                                        <h4 className="text-md font-medium text-slate-200 mb-4">Detailed Request List</h4>
                                        <div className="overflow-x-scroll h-64 overflow-y-auto">
                                            <table className="min-w-full divide-y divide-gray-700">
                                                <thead className="bg-muted">
                                                    <tr>
                                                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Employee</th>
                                                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Department</th>
                                                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Leave Type</th>
                                                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Start Date</th>
                                                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">End Date</th>
                                                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Duration</th>
                                                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Status</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="bg-card divide-y divide-gray-700">
                                                    {monthlyReport.requests.map((request, index) => {
                                                        const user = users[request.userId];
                                                        return (
                                                            <tr key={request.id || index}>
                                                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-200">{user?.name || 'Unknown'}</td>
                                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400">{user?.department || 'N/A'}</td>
                                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400">{request.type}</td>
                                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400">{request.startDate?.toDate().toLocaleDateString()}</td>
                                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400">{request.endDate?.toDate().toLocaleDateString()}</td>
                                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400">
                                                                    {request.leaveUnits || Math.ceil((request.endDate?.toDate() - request.startDate?.toDate()) / (1000 * 60 * 60 * 24))} days
                                                                </td>
                                                                <td className="px-6 py-4 whitespace-nowrap">
                                                                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                                                        request.status === 'Approved' ? 'bg-green-900/30 text-green-400' :
                                                                        request.status === 'Rejected' ? 'bg-red-900/30 text-red-400' :
                                                                        'bg-yellow-900/30 text-yellow-400'
                                                                    }`}>
                                                                        {request.status}
                                                                    </span>
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'manual' && (
                    <div className="p-6">
                        <div className="bg-muted p-6 rounded-lg">
                            <h3 className="text-lg font-medium text-slate-200 mb-4">Manual Leave Entry</h3>
                            <p className="text-slate-400 mb-6">
                                Add leave manually for employees. This will create an approved leave request and deduct from their balance.
                            </p>

                            <form onSubmit={handleManualLeaveSubmit} className="space-y-4">
                                {/* Employee Selection */}
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-1">Select Employee</label>
                                    <select
                                        value={manualLeaveData.employeeId || ''}
                                        onChange={(e) => setManualLeaveData(prev => ({ ...prev, employeeId: e.target.value }))}
                                        className="w-full px-3 py-2 border border-gray-600 rounded-md bg-card text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        required
                                    >
                                        <option value="">Choose an employee...</option>
                                        {Object.values(filteredUsers).map(user => (
                                            <option key={user.uid || user.id} value={user.uid || user.id}>
                                                {user.name} - {user.employeeNumber || 'No ID'} - {user.department || 'No Dept'}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                {/* Leave Type */}
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-1">Leave Type</label>
                                    <select
                                        value={manualLeaveData.type || 'Annual Leave'}
                                        onChange={(e) => setManualLeaveData(prev => ({ ...prev, type: e.target.value }))}
                                        className="w-full px-3 py-2 border border-gray-600 rounded-md bg-card text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    >
                                        {LEAVE_TYPES.map((leaveType, index) => (
                                            <option key={index} value={leaveType.value}>{leaveType.label}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Date Range */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-300 mb-1">Start Date</label>
                                        <input
                                            type="date"
                                            value={manualLeaveData.startDate || ''}
                                            onChange={(e) => setManualLeaveData(prev => ({ ...prev, startDate: e.target.value }))}
                                            className="w-full px-3 py-2 border border-gray-600 rounded-md bg-card text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-300 mb-1">End Date</label>
                                        <input
                                            type="date"
                                            value={manualLeaveData.endDate || ''}
                                            onChange={(e) => setManualLeaveData(prev => ({ ...prev, endDate: e.target.value }))}
                                            className="w-full px-3 py-2 border border-gray-600 rounded-md bg-card text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            required
                                        />
                                    </div>
                                </div>

                                {/* Leave Units */}
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-1">Leave Units (Days)</label>
                                    <input
                                        type="number"
                                        step="0.5"
                                        min="0"
                                        value={manualLeaveData.leaveUnits || ''}
                                        onChange={(e) => setManualLeaveData(prev => ({ ...prev, leaveUnits: parseFloat(e.target.value) || 0 }))}
                                        className="w-full px-3 py-2 border border-gray-600 rounded-md bg-card text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        required
                                    />
                                    <p className="text-xs text-slate-400 mt-1">Number of leave days to deduct from balance</p>
                                </div>

                                {/* Reason */}
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-1">Reason</label>
                                    <textarea
                                        value={manualLeaveData.reason || ''}
                                        onChange={(e) => setManualLeaveData(prev => ({ ...prev, reason: e.target.value }))}
                                        className="w-full px-3 py-2 border border-gray-600 rounded-md bg-card text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        rows="3"
                                        placeholder="Reason for manual leave entry"
                                        required
                                    />
                                </div>

                                {/* Submit Button */}
                                <div className="flex justify-end">
                                    <button
                                        type="submit"
                                        disabled={isSubmittingManualLeave}
                                        className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {isSubmittingManualLeave ? 'Adding Leave...' : 'Add Manual Leave'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {activeTab === 'shortleave' && (
                    <div className="p-6">
                        <div className="bg-muted p-6 rounded-lg">
                            <h3 className="text-lg font-medium text-slate-200 mb-4">Short Leave Reset</h3>
                            <p className="text-slate-400 mb-6">
                                Reset short leave balances to 1 for all employees. This will be done monthly (1st-31st cycle).
                            </p>

                            <div className="space-y-4">
                                <div className="bg-blue-900/20 border border-blue-500/30 p-4 rounded">
                                    <h4 className="text-blue-300 font-medium mb-2">Current Short Leave Status</h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {Object.values(filteredUsers).map(user => (
                                            <div key={user.uid || user.id} className="bg-slate-800/50 p-3 rounded">
                                                <div className="text-sm font-medium text-slate-200">{user.name}</div>
                                                <div className="text-xs text-slate-400">{user.employeeNumber || 'No ID'}</div>
                                                <div className="text-sm text-indigo-300">
                                                    Short Leave: {formatLeaveBalance(user.leaveBalance?.shortLeave || 0)}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="flex justify-end space-x-3">
                                    <button
                                        onClick={resetShortLeaveBalances}
                                        disabled={isResettingShortLeave}
                                        className="px-6 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {isResettingShortLeave ? 'Resetting...' : 'Reset All Short Leave to 1'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
                
                {activeTab === 'policy' && (
                    <div className="p-6 space-y-6">
                        <div className="bg-muted p-6 rounded-lg">
                            <h3 className="text-lg font-medium text-slate-200 mb-4">Leave Policy Information</h3>
                            <p className="text-slate-400 mb-6">
                                Reference guide for leave entitlements based on employee join date and current year.
                            </p>
                            <LeavePolicyReference />
                        </div>
                        
                        {/* Employee Policy Calculator */}
                        <div className="bg-muted p-6 rounded-lg">
                            <h3 className="text-lg font-medium text-slate-200 mb-4">Employee Policy Calculator</h3>
                            <p className="text-slate-400 mb-4">
                                Select an employee to view their specific leave entitlements based on the policy.
                            </p>
                            
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-1">Select Employee</label>
                                    <select
                                        value={editingUser?.uid || ''}
                                        onChange={(e) => {
                                            const userId = e.target.value;
                                            const user = Object.values(users).find(u => u.uid === userId || u.id === userId);
                                            setEditingUser(user || null);
                                        }}
                                        className="w-full px-3 py-2 border border-gray-600 rounded-md bg-card text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    >
                                        <option value="">Choose an employee...</option>
                                        {Object.values(filteredUsers).map(user => (
                                            <option key={user.uid || user.id} value={user.uid || user.id}>
                                                {user.name} - {user.employeeNumber || 'No ID'} - {user.department || 'No Dept'}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                
                                {editingUser && (
                                    <div>
                                        <LeavePolicyInfo employee={editingUser} />
                                    </div>
                                )}
                            </div>
                        </div>
                        
                        {/* Bulk Balance Calculation */}
                        <div className="bg-muted p-6 rounded-lg">
                            <h3 className="text-lg font-medium text-slate-200 mb-4">Bulk Leave Balance Calculation</h3>
                            <p className="text-slate-400 mb-4">
                                Calculate and update leave balances for all employees based on the new policy.
                            </p>
                            
                            <div className="bg-yellow-900/30 border border-yellow-600/50 p-4 rounded mb-4">
                                <div className="flex items-start space-x-3">
                                    <svg className="w-5 h-5 text-yellow-400 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                                    </svg>
                                    <div>
                                        <h4 className="text-sm font-medium text-yellow-300 mb-1">Warning: Bulk Operation</h4>
                                        <p className="text-sm text-yellow-200">
                                            This will overwrite existing leave balances for all employees based on the new policy calculation.
                                            This action cannot be undone. Please ensure you have a backup of current data.
                                        </p>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="flex justify-end">
                                <button
                                    onClick={calculateAllLeaveBalances}
                                    disabled={isCalculatingBalances}
                                    className="px-6 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isCalculatingBalances ? 'Calculating...' : 'Calculate All Balances'}
                                </button>
                            </div>
                        </div>
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

            {/* Edit Leave Balance Modal */}
            {showEditBalanceModal && editingUser && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-card rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                        <div className="p-6">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-lg font-medium text-slate-200">Edit Leave Balances - {editingUser.name}</h3>
                                <button
                                    onClick={() => {
                                        setShowEditBalanceModal(false);
                                        setEditingUser(null);
                                    }}
                                    className="text-slate-400 hover:text-slate-200"
                                >
                                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>

                            <div className="space-y-6">
                                {/* Leave Policy Information */}
                                {editingUser && (
                                    <div>
                                        <LeavePolicyInfo employee={editingUser} />
                                    </div>
                                )}
                                
                                {/* Current Leave Balances Section */}
                                <div>
                                    <h4 className="text-md font-semibold text-slate-300 mb-3">Current Leave Balances (Remaining Days)</h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-slate-300 mb-1">Annual Leave</label>
                                            <input
                                                type="number"
                                                step="0.5"
                                                value={editBalanceData.annualLeave}
                                                onChange={(e) => handleBalanceChange('annualLeave', e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-600 rounded-md text-slate-200 bg-card focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-slate-300 mb-1">Sick Leave</label>
                                            <input
                                                type="number"
                                                step="0.5"
                                                value={editBalanceData.sickLeave}
                                                onChange={(e) => handleBalanceChange('sickLeave', e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-600 rounded-md text-slate-200 bg-card focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-slate-300 mb-1">Casual Leave</label>
                                            <input
                                                type="number"
                                                step="0.5"
                                                value={editBalanceData.casualLeave}
                                                onChange={(e) => handleBalanceChange('casualLeave', e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-600 rounded-md text-slate-200 bg-card focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-slate-300 mb-1">Short Leave</label>
                                            <input
                                                type="number"
                                                step="0.5"
                                                value={editBalanceData.shortLeave}
                                                onChange={(e) => handleBalanceChange('shortLeave', e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-600 rounded-md text-slate-200 bg-card focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-slate-300 mb-1">Maternity Leave</label>
                                            <input
                                                type="number"
                                                step="0.5"
                                                value={editBalanceData.maternityLeave}
                                                onChange={(e) => handleBalanceChange('maternityLeave', e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-600 rounded-md text-slate-200 bg-card focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-slate-300 mb-1">Paternity Leave</label>
                                            <input
                                                type="number"
                                                step="0.5"
                                                value={editBalanceData.paternityLeave}
                                                onChange={(e) => handleBalanceChange('paternityLeave', e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-600 rounded-md text-slate-200 bg-card focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-slate-300 mb-1">Leave in-lieu</label>
                                            <input
                                                type="number"
                                                step="0.5"
                                                value={editBalanceData['leave in-lieu']}
                                                onChange={(e) => handleBalanceChange('leave in-lieu', e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-600 rounded-md text-slate-200 bg-card focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-slate-300 mb-1">Unpaid Leave</label>
                                            <input
                                                type="number"
                                                step="0.5"
                                                value={editBalanceData.unpaidLeave || 0}
                                                onChange={(e) => handleBalanceChange('unpaidLeave', e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-600 rounded-md text-slate-200 bg-card focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-slate-300 mb-1">Other Leave</label>
                                            <input
                                                type="number"
                                                step="0.5"
                                                value={editBalanceData.other}
                                                onChange={(e) => handleBalanceChange('other', e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-600 rounded-md text-slate-200 bg-card focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Total Leave Allocations Section */}
                                <div>
                                    <h4 className="text-md font-semibold text-slate-300 mb-3">Total Leave Allocations (Annual Entitlements)</h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-slate-300 mb-1">Annual Leave Total</label>
                                            <input
                                                type="number"
                                                step="0.5"
                                                value={editBalanceData.annualLeaveTotal}
                                                onChange={(e) => handleBalanceChange('annualLeaveTotal', e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-600 rounded-md text-slate-200 bg-card focus:outline-none focus:ring-2 focus:ring-green-500"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-slate-300 mb-1">Sick Leave Total</label>
                                            <input
                                                type="number"
                                                step="0.5"
                                                value={editBalanceData.sickLeaveTotal}
                                                onChange={(e) => handleBalanceChange('sickLeaveTotal', e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-600 rounded-md text-slate-200 bg-card focus:outline-none focus:ring-2 focus:ring-green-500"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-slate-300 mb-1">Casual Leave Total</label>
                                            <input
                                                type="number"
                                                step="0.5"
                                                value={editBalanceData.casualLeaveTotal}
                                                onChange={(e) => handleBalanceChange('casualLeaveTotal', e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-600 rounded-md text-slate-200 bg-card focus:outline-none focus:ring-2 focus:ring-green-500"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-slate-300 mb-1">Short Leave Total</label>
                                            <input
                                                type="number"
                                                step="0.5"
                                                value={editBalanceData.shortLeaveTotal}
                                                onChange={(e) => handleBalanceChange('shortLeaveTotal', e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-600 rounded-md text-slate-200 bg-card focus:outline-none focus:ring-2 focus:ring-green-500"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-slate-300 mb-1">Maternity Leave Total</label>
                                            <input
                                                type="number"
                                                step="0.5"
                                                value={editBalanceData.maternityLeaveTotal}
                                                onChange={(e) => handleBalanceChange('maternityLeaveTotal', e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-600 rounded-md text-slate-200 bg-card focus:outline-none focus:ring-2 focus:ring-green-500"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-slate-300 mb-1">Paternity Leave Total</label>
                                            <input
                                                type="number"
                                                step="0.5"
                                                value={editBalanceData.paternityLeaveTotal}
                                                onChange={(e) => handleBalanceChange('paternityLeaveTotal', e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-600 rounded-md text-slate-200 bg-card focus:outline-none focus:ring-2 focus:ring-green-500"
                                            />
                                        </div>



                                    </div>
                                </div>
                            </div>

                            <div className="flex justify-end space-x-3 mt-6">
                                <button
                                    onClick={() => {
                                        console.log('Cancel button clicked');
                                        setShowEditBalanceModal(false);
                                        setEditingUser(null);
                                    }}
                                    className="px-4 py-2 border border-gray-600 text-slate-300 rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 transition duration-150 ease-in-out"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={() => {
                                        console.log('Save Changes button clicked');
                                        console.log('Current editBalanceData:', editBalanceData);
                                        saveBalanceChanges();
                                    }}
                                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition duration-150 ease-in-out"
                                >
                                    Save Changes
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
