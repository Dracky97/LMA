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
import { calculateLeaveBalances, calculateLeaveEntitlements, LEAVE_CONFIG } from '../../lib/leavePolicy';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

const db = getFirestore(app);

export default function HRManagerDashboard() {
    const { userData, signup } = useAuth();
    const router = useRouter();
    
    // --- State Management ---
    const [allRequests, setAllRequests] = useState([]);
    const [users, setUsers] = useState({});
    const [filteredUsers, setFilteredUsers] = useState({});
    const [searchTerm, setSearchTerm] = useState('');
    const [message, setMessage] = useState(null);
    const [activeTab, setActiveTab] = useState('requests');
    const [showLeaveModal, setShowLeaveModal] = useState(false);
    
    // Reporting State
    const [activeReportTab, setActiveReportTab] = useState('generate');
    const [monthlyReport, setMonthlyReport] = useState(null);
    const [isGeneratingReport, setIsGeneratingReport] = useState(false);
    const [customReportStartDate, setCustomReportStartDate] = useState('');
    const [customReportEndDate, setCustomReportEndDate] = useState('');

    // Editing State
    const [editingUser, setEditingUser] = useState(null);
    const [showEditBalanceModal, setShowEditBalanceModal] = useState(false);
    const [editBalanceData, setEditBalanceData] = useState({});
    const [editingJoinedDate, setEditingJoinedDate] = useState(null);
    const [newJoinedDate, setNewJoinedDate] = useState('');

    // Manual Entry & Calc State
    const [manualLeaveData, setManualLeaveData] = useState({});
    const [isSubmittingManualLeave, setIsSubmittingManualLeave] = useState(false);
    const [isCalculatingBalances, setIsCalculatingBalances] = useState(false);

    // Add User State
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
        joinedDate: '',
        role: 'Employee'
    });
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    
    // User Management State
    const [userSearchQuery, setUserSearchQuery] = useState('');
    const [userRoleFilter, setUserRoleFilter] = useState('');
    const [userDepartmentFilter, setUserDepartmentFilter] = useState('');
    const [filteredUsersList, setFilteredUsersList] = useState([]);
    const [showEditUserModal, setShowEditUserModal] = useState(false);
    const [editingUserData, setEditingUserData] = useState(null);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);

    // --- Data Fetching ---
    useEffect(() => {
        const usersUnsubscribe = onSnapshot(collection(db, 'users'), (snapshot) => {
            const usersData = {};
            snapshot.forEach(doc => {
                usersData[doc.id] = { ...doc.data(), uid: doc.id, id: doc.id };
            });
            setUsers(usersData);
        });

        const requestsUnsubscribe = onSnapshot(collection(db, "leaveRequests"), (snapshot) => {
            const requests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            requests.sort((a, b) => {
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

    // Filter users for the Users tab
    useEffect(() => {
        let usersList = Object.values(users);

        // Apply search query filter
        if (userSearchQuery.trim()) {
            usersList = usersList.filter(user =>
                user.name?.toLowerCase().includes(userSearchQuery.toLowerCase()) ||
                user.email?.toLowerCase().includes(userSearchQuery.toLowerCase()) ||
                user.employeeNumber?.toLowerCase().includes(userSearchQuery.toLowerCase())
            );
        }

        // Apply role filter
        if (userRoleFilter) {
            usersList = usersList.filter(user => user.role === userRoleFilter);
        }

        // Apply department filter
        if (userDepartmentFilter) {
            usersList = usersList.filter(user => user.department === userDepartmentFilter);
        }

        // Sort by employee number
        usersList.sort((a, b) => {
            const empNumA = a.employeeNumber || '';
            const empNumB = b.employeeNumber || '';
            if (!empNumA && !empNumB) return 0;
            if (!empNumA) return 1;
            if (!empNumB) return -1;

            const numA = parseInt(empNumA);
            const numB = parseInt(empNumB);

            if (!isNaN(numA) && !isNaN(numB)) {
                return numA - numB;
            } else {
                return empNumA.localeCompare(empNumB);
            }
        });

        setFilteredUsersList(usersList);
    }, [users, userSearchQuery, userRoleFilter, userDepartmentFilter]);

    // Filter and sort users for balances tab
    useEffect(() => {
        let usersArray = Object.values(users);

        usersArray.sort((a, b) => {
            const empNumA = a.employeeNumber || '';
            const empNumB = b.employeeNumber || '';
            if (!empNumA && !empNumB) return 0;
            if (!empNumA) return 1;
            if (!empNumB) return -1;

            const numA = parseInt(empNumA);
            const numB = parseInt(empNumB);

            if (!isNaN(numA) && !isNaN(numB)) {
                return numA - numB;
            } else {
                return empNumA.localeCompare(empNumB);
            }
        });

        if (!searchTerm.trim()) {
            const sortedWithKeys = {};
            usersArray.forEach(user => {
                sortedWithKeys[user.uid || user.id] = user;
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
            const filteredWithKeys = {};
            filtered.forEach(user => {
                filteredWithKeys[user.uid || user.id] = user;
            });
            setFilteredUsers(filteredWithKeys);
        }
    }, [users, searchTerm]);

    // --- Action Handlers ---

    const deductLeaveBalance = async (request) => {
        try {
            const userRef = doc(db, "users", request.userId);
            const userDoc = await getDoc(userRef);

            if (!userDoc.exists()) throw new Error('User not found');

            const currentData = userDoc.data();
            const leaveType = LEAVE_TYPE_MAP[request.type] || (request.type ? request.type.toLowerCase().replace(' ', '') : 'annualleave');
            
            if (!currentData.leaveBalance) currentData.leaveBalance = {};

            let duration;
            if (request.type === 'Short Leave') {
                duration = request.totalHours || 0;
            } else {
                duration = request.leaveUnits !== undefined && request.leaveUnits > 0
                    ? request.leaveUnits
                    : Math.ceil((request.endDate.toDate() - request.startDate.toDate()) / (1000 * 60 * 60 * 24));
            }

            const updatedLeaveBalance = { ...currentData.leaveBalance };
            
            // Basic deduction logic
            const currentBalance = updatedLeaveBalance[leaveType] || 0;
            updatedLeaveBalance[leaveType] = currentBalance - duration;

            await updateDoc(userRef, { leaveBalance: updatedLeaveBalance });

        } catch (error) {
            console.error('Error deducting leave balance:', error);
            throw error; // Re-throw to be caught by calling function
        }
    };

    const handleFinalApproval = async (requestId, newStatus, rejectionReason = '') => {
        try {
            setMessage(null);
            const requestRef = doc(db, "leaveRequests", requestId);
            const request = allRequests.find(r => r.id === requestId);
            
            if (!request) throw new Error('Request not found');

            if (newStatus === 'Approved') {
                const isUnpaidLeave = request.type === 'Unpaid Leave';
                
                if (isUnpaidLeave) {
                    await updateDoc(requestRef, {
                        hrManagerApproval: 'Approved',
                        status: 'Approved',
                        hrManagerActionBy: userData.name,
                        hrApprovalDate: new Date().toISOString(),
                        rejectionReason: ''
                    });
                    setMessage({ type: 'success', text: 'Unpaid leave request approved. No balance deduction.' });
                } else {
                    await updateDoc(requestRef, {
                        hrManagerApproval: 'Approved',
                        status: 'Approved',
                        hrManagerActionBy: userData.name,
                        hrApprovalDate: new Date().toISOString(),
                        rejectionReason: ''
                    });
                    
                    // Deduct balance
                    await deductLeaveBalance(request);
                    setMessage({ type: 'success', text: 'Leave request approved and balance deducted.' });
                }
            } else {
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

    const handleManualLeaveSubmit = async (e) => {
        e.preventDefault();
        setIsSubmittingManualLeave(true);
        setMessage(null);

        try {
            if (!manualLeaveData.employeeId) throw new Error('Please select an employee');
            if (!manualLeaveData.startDate || !manualLeaveData.endDate) throw new Error('Please select dates');

            const employee = users[manualLeaveData.employeeId];
            
            // Create the approved request
            const requestData = {
                userId: manualLeaveData.employeeId,
                userName: employee.name,
                userEmail: employee.email,
                type: manualLeaveData.type || 'Annual Leave',
                startDate: new Date(manualLeaveData.startDate),
                endDate: new Date(manualLeaveData.endDate),
                leaveUnits: parseFloat(manualLeaveData.leaveUnits) || 0,
                reason: manualLeaveData.reason,
                status: 'Approved',
                hrManagerApproval: 'Approved',
                appliedOn: new Date(),
                hrManagerActionBy: userData.name,
                isManualEntry: true
            };

            const docRef = await addDoc(collection(db, "leaveRequests"), requestData);
            
            // Deduct balance
            await deductLeaveBalance({ ...requestData, id: docRef.id });

            setMessage({ type: 'success', text: 'Manual leave added and balance updated successfully.' });
            setManualLeaveData({}); // Reset form
        } catch (error) {
            console.error('Error creating manual leave:', error);
            setMessage({ type: 'error', text: error.message });
        } finally {
            setIsSubmittingManualLeave(false);
        }
    };

    // --- Reporting Functions ---

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
                // 25th to 25th logic
                startDate = new Date(currentYear, currentMonth - 1, 25);
                endDate = new Date(currentYear, currentMonth, 25);
                
                if (now.getDate() < 25) {
                    startDate.setMonth(currentMonth - 2);
                    endDate.setMonth(currentMonth - 1);
                    endDate.setDate(25);
                }
            }

            const reportRequests = allRequests.filter(request => {
                if (!request.startDate) return false;
                const requestStart = request.startDate.toDate();
                return requestStart >= startDate && requestStart <= endDate;
            });

            const departmentStats = {};
            const leaveTypeStats = {};
            const userStats = {};
            const noPayEmployees = [];
            const employeeDetails = [];

            reportRequests.forEach(request => {
                const user = users[request.userId];
                const department = user?.department || 'Unknown';
                const leaveType = request.type || 'Unknown';

                // Dept Stats
                if (!departmentStats[department]) departmentStats[department] = { total: 0, approved: 0, rejected: 0, pending: 0 };
                departmentStats[department].total++;
                if (request.status === 'Approved') departmentStats[department].approved++;
                else if (request.status === 'Rejected') departmentStats[department].rejected++;
                else departmentStats[department].pending++;

                // Leave Type Stats
                if (!leaveTypeStats[leaveType]) leaveTypeStats[leaveType] = { total: 0, approved: 0, rejected: 0, pending: 0 };
                leaveTypeStats[leaveType].total++;
                if (request.status === 'Approved') leaveTypeStats[leaveType].approved++;
                else if (request.status === 'Rejected') leaveTypeStats[leaveType].rejected++;
                else leaveTypeStats[leaveType].pending++;
            });

            // Build comprehensive employee details for ALL employees
            Object.values(users).forEach(user => {
                const userId = user.uid || user.id;
                
                // Get all leave requests for this employee in the date range
                const employeeRequests = reportRequests.filter(req => req.userId === userId);
                
                // Calculate total leave days taken (approved only)
                const totalLeaveDays = employeeRequests
                    .filter(req => req.status === 'Approved')
                    .reduce((sum, req) => sum + (parseFloat(req.leaveUnits) || 0), 0);

                // Get leave balance
                const leaveBalance = user.leaveBalance || {};
                
                // Check for negative balance
                const hasNegativeBalance = Object.values(leaveBalance).some(balance => balance < 0);
                if (hasNegativeBalance) {
                    noPayEmployees.push({
                        id: userId,
                        employeeId: user.employeeNumber || userId,
                        name: user.name,
                        department: user.department || 'N/A',
                        leaveBalance: leaveBalance,
                        noPayStatus: user.noPayStatus || false,
                        noPayStartDate: user.noPayStartDate,
                    });
                }

                // Add to employee details
                employeeDetails.push({
                    id: userId,
                    employeeNumber: user.employeeNumber || 'N/A',
                    name: user.name || 'Unknown',
                    department: user.department || 'N/A',
                    designation: user.designation || 'N/A',
                    leaveBalance: leaveBalance,
                    requests: employeeRequests,
                    totalLeaveDays: totalLeaveDays,
                    approvedRequests: employeeRequests.filter(r => r.status === 'Approved').length,
                    pendingRequests: employeeRequests.filter(r => r.status === 'Pending' || r.status === 'Pending HR Approval').length,
                    rejectedRequests: employeeRequests.filter(r => r.status === 'Rejected').length,
                });
            });

            // Sort employee details by department, then by name
            employeeDetails.sort((a, b) => {
                if (a.department !== b.department) {
                    return a.department.localeCompare(b.department);
                }
                return a.name.localeCompare(b.name);
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
                    pendingRequests: reportRequests.filter(r => r.status === 'Pending HR Approval').length,
                    totalEmployees: employeeDetails.length,
                    employeesWithLeave: employeeDetails.filter(e => e.requests.length > 0).length,
                },
                departmentStats,
                leaveTypeStats,
                requests: reportRequests,
                noPayEmployees,
                employeeDetails
            };

            setMonthlyReport(report);
            setActiveReportTab('view');
            setMessage(null);

        } catch (error) {
            console.error("Error generating report", error);
            setMessage({ type: 'error', text: "Failed to generate report" });
        } finally {
            setIsGeneratingReport(false);
        }
    };

    const generateCustomReport = async () => {
        if (!customReportStartDate || !customReportEndDate) {
            setMessage({ type: 'error', text: 'Please select both start and end dates.' });
            return;
        }
        if (new Date(customReportEndDate) < new Date(customReportStartDate)) {
            setMessage({ type: 'error', text: 'End date must be after start date.' });
            return;
        }
        await generateMonthlyReport(true, customReportStartDate, customReportEndDate);
    };

    const downloadReportAsPDF = () => {
        if (!monthlyReport) return;
        try {
            const pdf = new jsPDF('landscape'); // Use landscape for wider tables
            const pageWidth = pdf.internal.pageSize.getWidth();
            const pageHeight = pdf.internal.pageSize.getHeight();
            let yPosition = 20;

            const checkAndAddPage = (heightNeeded) => {
                if (yPosition + heightNeeded > pageHeight - 20) {
                    pdf.addPage();
                    yPosition = 20;
                }
            };

            // Title
            pdf.setFontSize(18);
            pdf.text('Leave Report', pageWidth / 2, yPosition, { align: 'center' });
            yPosition += 10;
            pdf.setFontSize(12);
            pdf.text(`${monthlyReport.period.start.toLocaleDateString()} - ${monthlyReport.period.end.toLocaleDateString()}`, pageWidth / 2, yPosition, { align: 'center' });
            yPosition += 15;

            // Summary
            pdf.setFontSize(14);
            pdf.text('Summary', 20, yPosition);
            yPosition += 8;
            pdf.setFontSize(10);
            pdf.text(`Total Requests: ${monthlyReport.summary.totalRequests}`, 20, yPosition);
            pdf.text(`Approved: ${monthlyReport.summary.approvedRequests}`, 70, yPosition);
            pdf.text(`Rejected: ${monthlyReport.summary.rejectedRequests}`, 120, yPosition);
            pdf.text(`Pending: ${monthlyReport.summary.pendingRequests}`, 170, yPosition);
            yPosition += 6;
            pdf.text(`Total Employees: ${monthlyReport.summary.totalEmployees}`, 20, yPosition);
            pdf.text(`Employees with Leave: ${monthlyReport.summary.employeesWithLeave}`, 70, yPosition);
            yPosition += 15;

            // Department Stats
            checkAndAddPage(30);
            pdf.setFontSize(14);
            pdf.text('Department Statistics', 20, yPosition);
            yPosition += 8;
            pdf.setFontSize(9);
            
            Object.entries(monthlyReport.departmentStats).forEach(([dept, stats]) => {
                checkAndAddPage(7);
                pdf.text(`${dept}: ${stats.total} Total (${stats.approved} Approved, ${stats.rejected} Rejected, ${stats.pending} Pending)`, 20, yPosition);
                yPosition += 6;
            });
            yPosition += 10;

            // Leave Type Stats
            checkAndAddPage(30);
            pdf.setFontSize(14);
            pdf.text('Leave Type Statistics', 20, yPosition);
            yPosition += 8;
            pdf.setFontSize(9);
            
            Object.entries(monthlyReport.leaveTypeStats).forEach(([type, stats]) => {
                checkAndAddPage(7);
                pdf.text(`${type}: ${stats.total} Total (${stats.approved} Approved, ${stats.rejected} Rejected, ${stats.pending} Pending)`, 20, yPosition);
                yPosition += 6;
            });
            yPosition += 10;

            // All Employees Table
            checkAndAddPage(40);
            pdf.setFontSize(14);
            pdf.text('All Employees Leave Report', 20, yPosition);
            yPosition += 8;
            
            // Table headers
            pdf.setFontSize(8);
            pdf.setFont(undefined, 'bold');
            const colX = [20, 35, 80, 120, 155, 175, 195, 215, 235, 255];
            pdf.text('Emp#', colX[0], yPosition);
            pdf.text('Name', colX[1], yPosition);
            pdf.text('Department', colX[2], yPosition);
            pdf.text('Designation', colX[3], yPosition);
            pdf.text('Days', colX[4], yPosition);
            pdf.text('Req', colX[5], yPosition);
            pdf.text('Annual', colX[6], yPosition);
            pdf.text('Casual', colX[7], yPosition);
            pdf.text('Medical', colX[8], yPosition);
            yPosition += 6;
            pdf.setFont(undefined, 'normal');

            // Table rows
            monthlyReport.employeeDetails.forEach((emp) => {
                checkAndAddPage(6);
                
                pdf.text(emp.employeeNumber.substring(0, 10), colX[0], yPosition);
                pdf.text(emp.name.substring(0, 30), colX[1], yPosition);
                pdf.text(emp.department.substring(0, 25), colX[2], yPosition);
                pdf.text(emp.designation.substring(0, 20), colX[3], yPosition);
                pdf.text(emp.totalLeaveDays > 0 ? emp.totalLeaveDays.toFixed(1) : '-', colX[4], yPosition);
                
                const reqText = emp.requests.length > 0 ?
                    `${emp.approvedRequests}/${emp.pendingRequests}/${emp.rejectedRequests}` : '-';
                pdf.text(reqText, colX[5], yPosition);
                
                pdf.text(emp.leaveBalance['annualLeave'] !== undefined ?
                    emp.leaveBalance['annualLeave'].toFixed(1) : '-', colX[6], yPosition);
                pdf.text(emp.leaveBalance['casualLeave'] !== undefined ?
                    emp.leaveBalance['casualLeave'].toFixed(1) : '-', colX[7], yPosition);
                pdf.text(emp.leaveBalance['sickLeave'] !== undefined ?
                    emp.leaveBalance['sickLeave'].toFixed(1) : '-', colX[8], yPosition);
                
                yPosition += 5;
            });

            yPosition += 10;

            // No Pay Employees
            if (monthlyReport.noPayEmployees.length > 0) {
                checkAndAddPage(30);
                pdf.setFontSize(14);
                pdf.setTextColor(255, 0, 0);
                pdf.text('Employees with Negative Balance', 20, yPosition);
                pdf.setTextColor(0, 0, 0);
                yPosition += 8;
                pdf.setFontSize(9);
                
                monthlyReport.noPayEmployees.forEach((emp) => {
                    checkAndAddPage(10);
                    const negBalances = Object.entries(emp.leaveBalance)
                        .filter(([_, balance]) => balance < 0)
                        .map(([type, balance]) => `${type}: ${balance.toFixed(1)}`)
                        .join(', ');
                    pdf.text(`${emp.name} (${emp.employeeId}) - ${emp.department}`, 20, yPosition);
                    yPosition += 5;
                    pdf.text(`  ${negBalances}`, 20, yPosition);
                    yPosition += 7;
                });
            }

            // Save
            pdf.save(`Leave_Report_${monthlyReport.period.month.replace(/\s+/g, '_')}.pdf`);
            setMessage({ type: 'success', text: 'PDF downloaded successfully.' });

        } catch (error) {
            console.error('Error generating PDF:', error);
            setMessage({ type: 'error', text: 'Error generating PDF.' });
        }
    };

    // --- Bulk Calculation ---
    
    const calculateAllLeaveBalances = async () => {
        try {
            setIsCalculatingBalances(true);
            setMessage(null);
            if (!window.confirm("This will overwrite all balances. Continue?")) return;

            let successCount = 0;
            const errors = [];

            for (const user of Object.values(users)) {
                try {
                    if (!user.joinedDate) continue;

                    const userRequests = allRequests.filter(r => 
                        r.userId === user.uid && 
                        new Date(r.startDate).getFullYear() === new Date().getFullYear()
                    );

                    const calculated = calculateLeaveBalances({ ...user, joinDate: user.joinedDate }, userRequests);
                    
                    await updateDoc(doc(db, "users", user.uid || user.id), {
                        leaveBalance: {
                            annualLeave: calculated.annualLeave,
                            casualLeave: calculated.casualLeave,
                            sickLeave: calculated.sickLeave,
                            shortLeave: calculated.shortLeave
                        },
                        leaveAllocations: calculated.entitlements,
                        lastBalanceCalculation: new Date().toISOString()
                    });
                    successCount++;
                } catch (err) {
                    errors.push(`${user.name}: ${err.message}`);
                }
            }
            setMessage({ type: 'success', text: `Updated ${successCount} users. ${errors.length} errors.` });
        } catch (error) {
            setMessage({ type: 'error', text: error.message });
        } finally {
            setIsCalculatingBalances(false);
        }
    };

    // --- Helper Functions ---
    const handleProfileClick = (userId) => router.push(`/profile/${userId}`);
    const formatLeaveBalance = (balance) => {
        if (balance === undefined || balance === null) return '0';
        return balance % 1 === 0 ? balance.toString() : balance.toFixed(1);
    };

    // --- UI Modals & Editing ---
    const openEditBalanceModal = (user) => {
        setEditingUser(user);
        setEditBalanceData({
            annualLeave: user.leaveBalance?.annualLeave || 0,
            sickLeave: user.leaveBalance?.sickLeave || 0,
            casualLeave: user.leaveBalance?.casualLeave || 0,
            shortLeave: user.leaveBalance?.shortLeave || 0,
            annualLeaveTotal: user.leaveAllocations?.annualLeave || 0,
            sickLeaveTotal: user.leaveAllocations?.sickLeave || 0,
            casualLeaveTotal: user.leaveAllocations?.casualLeave || 0,
        });
        setShowEditBalanceModal(true);
    };

    const handleEditJoinedDate = (user) => {
        setEditingJoinedDate(user);
        setNewJoinedDate(user.joinedDate ? new Date(user.joinedDate).toISOString().split('T')[0] : '');
    };

    const saveJoinedDateChanges = async () => {
        if (!editingJoinedDate) return;
        try {
            await updateDoc(doc(db, "users", editingJoinedDate.uid), {
                joinedDate: newJoinedDate ? new Date(newJoinedDate).toISOString() : null
            });
            setEditingJoinedDate(null);
        } catch (error) {
            console.error(error);
        }
    };

    const saveBalanceChanges = async () => {
        if (!editingUser) return;
        try {
            // Validate against policy if join date exists
            let policyWarning = '';
            if (editingUser.joinDate) {
                try {
                    const policyEntitlements = calculateLeaveEntitlements(editingUser.joinDate, new Date().getFullYear());
                    
                    // Check if manual values deviate significantly from policy
                    const warnings = [];
                    if (editBalanceData.annualLeaveTotal !== policyEntitlements.annualLeave) {
                        warnings.push(`Annual Leave allocation (${editBalanceData.annualLeaveTotal}) differs from policy (${policyEntitlements.annualLeave})`);
                    }
                    if (editBalanceData.sickLeaveTotal !== policyEntitlements.sickLeave) {
                        warnings.push(`Sick Leave allocation (${editBalanceData.sickLeaveTotal}) differs from policy (${policyEntitlements.sickLeave})`);
                    }
                    if (editBalanceData.casualLeaveTotal !== policyEntitlements.casualLeave) {
                        warnings.push(`Casual Leave allocation (${editBalanceData.casualLeaveTotal}) differs from policy (${policyEntitlements.casualLeave})`);
                    }
                    
                    if (warnings.length > 0) {
                        policyWarning = '\n\nPolicy Deviation Warning:\n' + warnings.join('\n');
                        if (!confirm(`You are setting values that differ from the policy:${policyWarning}\n\nDo you want to proceed?`)) {
                            return;
                        }
                    }
                } catch (policyError) {
                    console.warn('Could not validate against policy:', policyError);
                }
            }
            
            // Short Leave should NOT have annual allocation - always use monthly reset
            await updateDoc(doc(db, "users", editingUser.uid), {
                leaveBalance: {
                    ...editingUser.leaveBalance,
                    annualLeave: editBalanceData.annualLeave,
                    sickLeave: editBalanceData.sickLeave,
                    casualLeave: editBalanceData.casualLeave,
                    shortLeave: editBalanceData.shortLeave
                },
                leaveAllocations: {
                    ...editingUser.leaveAllocations,
                    annualLeave: editBalanceData.annualLeaveTotal,
                    sickLeave: editBalanceData.sickLeaveTotal,
                    casualLeave: editBalanceData.casualLeaveTotal
                    // Note: shortLeave allocation intentionally omitted - uses monthly reset
                }
            });
            setShowEditBalanceModal(false);
            setMessage({ type: 'success', text: 'Balances updated.' + (policyWarning ? ' (Policy deviation noted)' : '') });
        } catch (error) {
            setMessage({ type: 'error', text: error.message });
        }
    };

    // Add User Handlers
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
                joinedDate: '',
                role: 'Employee'
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

    // User Management Handlers
    const handleEditUser = (user) => {
        setEditingUserData({
            uid: user.uid || user.id,
            name: user.name || '',
            email: user.email || '',
            department: user.department || '',
            designation: user.designation || '',
            employeeNumber: user.employeeNumber || '',
            gender: user.gender || '',
            managerId: user.managerId || '',
            employeeStatus: user.employeeStatus || 'probation',
            joinedDate: user.joinedDate ? new Date(user.joinedDate).toISOString().split('T')[0] : '',
            birthday: user.personalDetails?.dob || ''
        });
        setShowEditUserModal(true);
    };

    const handleEditUserChange = (e) => {
        const { name, value } = e.target;
        setEditingUserData(prev => ({
            ...prev,
            [name]: value
        }));
    };

    const handleSaveUserEdit = async (e) => {
        e.preventDefault();
        setError('');
        setSuccess('');

        try {
            const userRef = doc(db, 'users', editingUserData.uid);
            const updateData = {
                name: editingUserData.name,
                department: editingUserData.department,
                designation: editingUserData.designation,
                employeeNumber: editingUserData.employeeNumber,
                gender: editingUserData.gender,
                managerId: editingUserData.managerId || null,
                employeeStatus: editingUserData.employeeStatus
            };

            // Update joined date if changed
            if (editingUserData.joinedDate) {
                const joinedDateObj = new Date(editingUserData.joinedDate);
                const nextEvaluationDate = new Date(joinedDateObj);
                nextEvaluationDate.setMonth(nextEvaluationDate.getMonth() + 3);
                updateData.joinedDate = joinedDateObj.toISOString();
                updateData.nextEvaluationDate = nextEvaluationDate.toISOString();
            }

            // Update birthday in personalDetails
            if (editingUserData.birthday) {
                const currentUser = users[editingUserData.uid];
                updateData.personalDetails = {
                    ...currentUser.personalDetails,
                    dob: editingUserData.birthday
                };
            }

            await updateDoc(userRef, updateData);
            setSuccess('User updated successfully!');
            setShowEditUserModal(false);
            setEditingUserData(null);
            setTimeout(() => setSuccess(''), 3000);
        } catch (err) {
            setError(err.message || 'Failed to update user');
        }
    };

    const handleDeleteUser = async (userId) => {
        try {
            const response = await fetch('/api/delete-user', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId })
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Failed to delete user');
            }

            setSuccess('User deleted successfully from database and authentication');
            setShowDeleteConfirm(null);
            setTimeout(() => setSuccess(''), 3000);
        } catch (error) {
            console.error('Error deleting user:', error);
            setError('Failed to delete user: ' + error.message);
        }
    };

    const pendingFinalHRRequests = allRequests.filter(r => r.status === 'Pending HR Approval' && r.hrManagerApproval !== 'Approved');

    return (
        <div className="space-y-6">
            <div className="border-b pb-8 mb-8 border-gray-700">
                <MyLeaveSection />
            </div>

            {message && (
                <div className={`p-3 rounded-md ${message.type === 'success' ? 'bg-green-900/30 text-green-300' : 'bg-red-900/30 text-red-300'}`}>
                    {message.text}
                </div>
            )}

            {/* Navigation Tabs */}
            <div className="border-b border-gray-700">
                <nav className="-mb-px flex space-x-8">
                    {['requests', 'balances', 'history', 'reports', 'manual', 'users', 'policy'].map(tab => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`py-4 px-1 border-b-2 font-medium text-sm capitalize ${
                                activeTab === tab ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-500 hover:text-slate-300'
                            }`}
                        >
                            {tab} {tab === 'requests' && `(${pendingFinalHRRequests.length})`}
                        </button>
                    ))}
                </nav>
            </div>

            <div className="flex justify-end">
                <button
                    onClick={() => setShowLeaveModal(true)}
                    className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
                >
                    Apply for Leave
                </button>
            </div>

            <div className="bg-card rounded-lg shadow-sm">
                
                {/* 1. REQUESTS TAB */}
                {activeTab === 'requests' && (
                    <div className="p-6">
                        <ManagerRequestsTable requests={pendingFinalHRRequests} users={users} onUpdate={handleFinalApproval} isHRView={true} />
                    </div>
                )}

                {/* 2. BALANCES TAB */}
                {activeTab === 'balances' && (
                    <div className="p-6">
                        <div className="mb-6">
                            <input
                                type="text"
                                placeholder="Search users..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="block w-full px-3 py-2 border border-gray-600 rounded-md bg-muted text-slate-200"
                            />
                        </div>
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-700">
                                <thead className="bg-muted">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase">Actions</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase">Employee</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase">Dept</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase">Joined</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase">Annual</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase">Casual</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase">Sick</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-card divide-y divide-gray-700">
                                    {Object.values(filteredUsers).map(user => (
                                        <tr key={user.uid || user.id}>
                                            <td className="px-6 py-4">
                                                <button onClick={() => openEditBalanceModal(user)} className="text-blue-400 hover:text-blue-300">Edit</button>
                                            </td>
                                            <td className="px-6 py-4 text-slate-200">
                                                <button onClick={() => handleProfileClick(user.uid)} className="hover:underline">{user.name}</button>
                                            </td>
                                            <td className="px-6 py-4 text-slate-400">{user.department}</td>
                                            <td className="px-6 py-4 text-slate-400">
                                                {editingJoinedDate?.uid === user.uid ? (
                                                    <div className="flex space-x-2">
                                                        <input type="date" value={newJoinedDate} onChange={e => setNewJoinedDate(e.target.value)} className="bg-card text-xs p-1" />
                                                        <button onClick={saveJoinedDateChanges} className="text-green-500">Save</button>
                                                        <button onClick={() => setEditingJoinedDate(null)} className="text-gray-500">X</button>
                                                    </div>
                                                ) : (
                                                    <div className="flex space-x-2">
                                                        <span>{user.joinedDate ? new Date(user.joinedDate).toLocaleDateString() : '-'}</span>
                                                        <button onClick={() => handleEditJoinedDate(user)} className="text-blue-400 text-xs">Edit</button>
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-slate-400">{formatLeaveBalance(user.leaveBalance?.annualLeave)}</td>
                                            <td className="px-6 py-4 text-slate-400">{formatLeaveBalance(user.leaveBalance?.casualLeave)}</td>
                                            <td className="px-6 py-4 text-slate-400">{formatLeaveBalance(user.leaveBalance?.sickLeave)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* 3. HISTORY TAB */}
                {activeTab === 'history' && (
                    <div className="p-6">
                        <LeaveHistoryTable requests={allRequests} users={users} isAdminView={true} />
                    </div>
                )}

                {/* 4. REPORTS TAB */}
                {activeTab === 'reports' && (
                    <div className="p-6">
                        <div className="border-b border-gray-700 mb-6 flex space-x-4">
                            <button onClick={() => setActiveReportTab('generate')} className={activeReportTab === 'generate' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-slate-500'}>Generate</button>
                            <button onClick={() => setActiveReportTab('view')} disabled={!monthlyReport} className={activeReportTab === 'view' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-slate-500'}>View Report</button>
                        </div>
                        
                        {activeReportTab === 'generate' && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="bg-muted p-6 rounded">
                                    <h3 className="text-slate-200 mb-4">Current Month</h3>
                                    <button onClick={() => generateMonthlyReport(false)} disabled={isGeneratingReport} className="bg-blue-600 text-white px-4 py-2 rounded">
                                        {isGeneratingReport ? 'Generating...' : 'Generate Standard Report'}
                                    </button>
                                </div>
                                <div className="bg-muted p-6 rounded">
                                    <h3 className="text-slate-200 mb-4">Custom Range</h3>
                                    <div className="flex gap-2 mb-4">
                                        <input type="date" value={customReportStartDate} onChange={e => setCustomReportStartDate(e.target.value)} className="bg-card p-2 rounded text-slate-200" />
                                        <input type="date" value={customReportEndDate} onChange={e => setCustomReportEndDate(e.target.value)} className="bg-card p-2 rounded text-slate-200" />
                                    </div>
                                    <button onClick={generateCustomReport} disabled={isGeneratingReport} className="bg-green-600 text-white px-4 py-2 rounded">Generate Custom</button>
                                </div>
                            </div>
                        )}

                        {activeReportTab === 'view' && monthlyReport && (
                            <div>
                                <div className="flex justify-between items-center mb-6">
                                    <h3 className="text-xl text-slate-200">Report: {monthlyReport.period.month}</h3>
                                    <button onClick={downloadReportAsPDF} className="bg-red-600 text-white px-3 py-1 rounded">Download PDF</button>
                                </div>
                                
                                {/* Summary Cards */}
                                <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-8">
                                    <div className="bg-blue-900/30 p-4 rounded text-blue-400 font-bold text-xl">
                                        {monthlyReport.summary.totalRequests}
                                        <span className="text-sm font-normal text-slate-400 block">Total Requests</span>
                                    </div>
                                    <div className="bg-green-900/30 p-4 rounded text-green-400 font-bold text-xl">
                                        {monthlyReport.summary.approvedRequests}
                                        <span className="text-sm font-normal text-slate-400 block">Approved</span>
                                    </div>
                                    <div className="bg-red-900/30 p-4 rounded text-red-400 font-bold text-xl">
                                        {monthlyReport.summary.rejectedRequests}
                                        <span className="text-sm font-normal text-slate-400 block">Rejected</span>
                                    </div>
                                    <div className="bg-yellow-900/30 p-4 rounded text-yellow-400 font-bold text-xl">
                                        {monthlyReport.summary.pendingRequests}
                                        <span className="text-sm font-normal text-slate-400 block">Pending</span>
                                    </div>
                                    <div className="bg-purple-900/30 p-4 rounded text-purple-400 font-bold text-xl">
                                        {monthlyReport.summary.totalEmployees}
                                        <span className="text-sm font-normal text-slate-400 block">Total Employees</span>
                                    </div>
                                    <div className="bg-indigo-900/30 p-4 rounded text-indigo-400 font-bold text-xl">
                                        {monthlyReport.summary.employeesWithLeave}
                                        <span className="text-sm font-normal text-slate-400 block">On Leave</span>
                                    </div>
                                </div>

                                {/* Department Statistics */}
                                <div className="mb-8">
                                    <h4 className="text-lg font-semibold text-slate-200 mb-4">Department Statistics</h4>
                                    <div className="bg-muted rounded-lg overflow-hidden">
                                        <table className="min-w-full divide-y divide-gray-700">
                                            <thead className="bg-card">
                                                <tr>
                                                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">Department</th>
                                                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">Total</th>
                                                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">Approved</th>
                                                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">Rejected</th>
                                                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">Pending</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-700">
                                                {Object.entries(monthlyReport.departmentStats).map(([dept, stats]) => (
                                                    <tr key={dept}>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-200">{dept}</td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-300">{stats.total}</td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-green-400">{stats.approved}</td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-red-400">{stats.rejected}</td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-yellow-400">{stats.pending}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                {/* Leave Type Statistics */}
                                <div className="mb-8">
                                    <h4 className="text-lg font-semibold text-slate-200 mb-4">Leave Type Statistics</h4>
                                    <div className="bg-muted rounded-lg overflow-hidden">
                                        <table className="min-w-full divide-y divide-gray-700">
                                            <thead className="bg-card">
                                                <tr>
                                                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">Leave Type</th>
                                                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">Total</th>
                                                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">Approved</th>
                                                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">Rejected</th>
                                                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">Pending</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-700">
                                                {Object.entries(monthlyReport.leaveTypeStats).map(([type, stats]) => (
                                                    <tr key={type}>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-200">{type}</td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-300">{stats.total}</td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-green-400">{stats.approved}</td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-red-400">{stats.rejected}</td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-yellow-400">{stats.pending}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                {/* All Employees Leave Report */}
                                <div className="mb-8">
                                    <h4 className="text-lg font-semibold text-slate-200 mb-4">All Employees Leave Report</h4>
                                    <div className="bg-muted rounded-lg overflow-hidden">
                                        <div className="overflow-x-auto">
                                            <table className="min-w-full divide-y divide-gray-700">
                                                <thead className="bg-card">
                                                    <tr>
                                                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">Emp #</th>
                                                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">Name</th>
                                                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">Department</th>
                                                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">Designation</th>
                                                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">Leave Days</th>
                                                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">Requests</th>
                                                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">Annual</th>
                                                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">Casual</th>
                                                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">Medical</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-700">
                                                    {monthlyReport.employeeDetails.map((employee) => (
                                                        <tr key={employee.id} className={employee.requests.length > 0 ? 'bg-blue-900/10' : ''}>
                                                            <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-300">{employee.employeeNumber}</td>
                                                            <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-200">{employee.name}</td>
                                                            <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-300">{employee.department}</td>
                                                            <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-300">{employee.designation}</td>
                                                            <td className="px-4 py-3 whitespace-nowrap text-sm font-semibold text-blue-400">
                                                                {employee.totalLeaveDays > 0 ? employee.totalLeaveDays.toFixed(1) : '-'}
                                                            </td>
                                                            <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-300">
                                                                {employee.requests.length > 0 ? (
                                                                    <span>
                                                                        <span className="text-green-400">{employee.approvedRequests}</span>
                                                                        {employee.pendingRequests > 0 && <span className="text-yellow-400"> / {employee.pendingRequests}P</span>}
                                                                        {employee.rejectedRequests > 0 && <span className="text-red-400"> / {employee.rejectedRequests}R</span>}
                                                                    </span>
                                                                ) : '-'}
                                                            </td>
                                                            <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-300">
                                                                {employee.leaveBalance['annualLeave'] !== undefined ?
                                                                    <span className={employee.leaveBalance['annualLeave'] < 0 ? 'text-red-400 font-semibold' : ''}>
                                                                        {employee.leaveBalance['annualLeave'].toFixed(1)}
                                                                    </span> : '-'}
                                                            </td>
                                                            <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-300">
                                                                {employee.leaveBalance['casualLeave'] !== undefined ?
                                                                    <span className={employee.leaveBalance['casualLeave'] < 0 ? 'text-red-400 font-semibold' : ''}>
                                                                        {employee.leaveBalance['casualLeave'].toFixed(1)}
                                                                    </span> : '-'}
                                                            </td>
                                                            <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-300">
                                                                {employee.leaveBalance['sickLeave'] !== undefined ?
                                                                    <span className={employee.leaveBalance['sickLeave'] < 0 ? 'text-red-400 font-semibold' : ''}>
                                                                        {employee.leaveBalance['sickLeave'].toFixed(1)}
                                                                    </span> : '-'}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                    <div className="mt-2 text-xs text-slate-400">
                                        <p>* Highlighted rows indicate employees with leave in the selected period</p>
                                        <p>* Leave Days: Total approved leave days in the period | Requests: Approved / Pending / Rejected</p>
                                        <p>* Balance columns show current leave balance (negative values in red)</p>
                                    </div>
                                </div>

                                {/* No Pay Employees Warning */}
                                {monthlyReport.noPayEmployees.length > 0 && (
                                    <div className="mb-8">
                                        <h4 className="text-lg font-semibold text-red-400 mb-4">⚠️ Employees with Negative Balance</h4>
                                        <div className="bg-red-900/20 rounded-lg overflow-hidden border border-red-800">
                                            <table className="min-w-full divide-y divide-red-800">
                                                <thead className="bg-red-900/30">
                                                    <tr>
                                                        <th className="px-6 py-3 text-left text-xs font-medium text-red-300 uppercase tracking-wider">Employee</th>
                                                        <th className="px-6 py-3 text-left text-xs font-medium text-red-300 uppercase tracking-wider">Department</th>
                                                        <th className="px-6 py-3 text-left text-xs font-medium text-red-300 uppercase tracking-wider">Negative Balances</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-red-800">
                                                    {monthlyReport.noPayEmployees.map((emp) => (
                                                        <tr key={emp.id}>
                                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-200">
                                                                {emp.name} ({emp.employeeId})
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-300">{emp.department}</td>
                                                            <td className="px-6 py-4 text-sm text-red-400">
                                                                {Object.entries(emp.leaveBalance)
                                                                    .filter(([_, balance]) => balance < 0)
                                                                    .map(([type, balance]) => `${type}: ${balance.toFixed(1)}`)
                                                                    .join(', ')}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* 5. MANUAL TAB */}
                {activeTab === 'manual' && (
                    <div className="p-6">
                        <form onSubmit={handleManualLeaveSubmit} className="space-y-4 max-w-xl">
                            <h3 className="text-lg text-slate-200">Add Manual Leave</h3>
                            <select 
                                value={manualLeaveData.employeeId || ''} 
                                onChange={e => setManualLeaveData(prev => ({...prev, employeeId: e.target.value}))}
                                className="w-full p-2 bg-card border border-gray-600 rounded text-slate-200"
                            >
                                <option value="">Select Employee...</option>
                                {Object.values(filteredUsers).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                            </select>
                            <select 
                                value={manualLeaveData.type || 'Annual Leave'} 
                                onChange={e => setManualLeaveData(prev => ({...prev, type: e.target.value}))}
                                className="w-full p-2 bg-card border border-gray-600 rounded text-slate-200"
                            >
                                {LEAVE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                            </select>
                            <div className="flex gap-4">
                                <input type="date" value={manualLeaveData.startDate || ''} onChange={e => setManualLeaveData(prev => ({...prev, startDate: e.target.value}))} className="w-full p-2 bg-card rounded text-slate-200 border border-gray-600" />
                                <input type="date" value={manualLeaveData.endDate || ''} onChange={e => setManualLeaveData(prev => ({...prev, endDate: e.target.value}))} className="w-full p-2 bg-card rounded text-slate-200 border border-gray-600" />
                            </div>
                            <input type="number" step="0.5" placeholder="Units (Days)" value={manualLeaveData.leaveUnits || ''} onChange={e => setManualLeaveData(prev => ({...prev, leaveUnits: e.target.value}))} className="w-full p-2 bg-card rounded text-slate-200 border border-gray-600" />
                            <textarea placeholder="Reason" value={manualLeaveData.reason || ''} onChange={e => setManualLeaveData(prev => ({...prev, reason: e.target.value}))} className="w-full p-2 bg-card rounded text-slate-200 border border-gray-600" />
                            <button type="submit" disabled={isSubmittingManualLeave} className="bg-blue-600 text-white px-4 py-2 rounded">Submit Manual Leave</button>
                        </form>
                    </div>
                )}

                {/* 6. USERS TAB */}
                {activeTab === 'users' && (
                    <div className="p-6">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-semibold text-slate-200">User Management</h3>
                            <button
                                onClick={() => setShowAddUserForm(true)}
                                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium transition duration-150 ease-in-out"
                            >
                                Add New User
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

                        {/* Search and Filters */}
                        <div className="mb-6 space-y-4">
                            {/* Search Bar */}
                            <div className="relative">
                                <input
                                    type="text"
                                    placeholder="Search by name, email, or employee number..."
                                    value={userSearchQuery}
                                    onChange={(e) => setUserSearchQuery(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-200 bg-card"
                                />
                                <svg className="absolute left-3 top-2.5 h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                            </div>

                            {/* Filter Row */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                {/* Role Filter */}
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-1">Filter by Role</label>
                                    <select
                                        value={userRoleFilter}
                                        onChange={(e) => setUserRoleFilter(e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-200 bg-card"
                                    >
                                        <option value="">All Roles</option>
                                        <option value="Employee">Employee</option>
                                        <option value="Admin">Admin</option>
                                        <option value="CEO">CEO</option>
                                        <option value="Manager HR">Manager HR</option>
                                        <option value="Finance Manager">Finance Manager</option>
                                        <option value="Manager IT">Manager IT</option>
                                    </select>
                                </div>

                                {/* Department Filter */}
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-1">Filter by Department</label>
                                    <select
                                        value={userDepartmentFilter}
                                        onChange={(e) => setUserDepartmentFilter(e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-200 bg-card"
                                    >
                                        <option value="">All Departments</option>
                                        <option value="Human Resources">Human Resources</option>
                                        <option value="Finance">Finance</option>
                                        <option value="Academic">Academic</option>
                                        <option value="Marketing">Marketing</option>
                                        <option value="Administration">Administration</option>
                                        <option value="IT">IT</option>
                                        <option value="Operations">Operations</option>
                                        <option value="Registrar">Registrar</option>
                                        <option value="Student Support">Student Support</option>
                                    </select>
                                </div>

                                {/* Clear Filters */}
                                <div className="flex items-end">
                                    <button
                                        onClick={() => {
                                            setUserSearchQuery('');
                                            setUserRoleFilter('');
                                            setUserDepartmentFilter('');
                                        }}
                                        className="w-full px-3 py-2 border border-gray-600 text-slate-300 rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 transition duration-150 ease-in-out"
                                    >
                                        Clear Filters
                                    </button>
                                </div>
                            </div>

                            {/* Results Count */}
                            <div className="text-sm text-slate-400">
                                Showing {filteredUsersList.length} of {Object.keys(users).length} users
                            </div>
                        </div>

                        {/* Users Table */}
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-700">
                                <thead className="bg-muted">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Actions</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Emp #</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Name</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Email</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Role</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Department</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-card divide-y divide-gray-700">
                                    {filteredUsersList.filter(u => !u.deleted).map(user => (
                                        <tr key={user.uid || user.id} className="hover:bg-muted">
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="flex space-x-2">
                                                    <button
                                                        onClick={() => handleEditUser(user)}
                                                        className="text-blue-400 hover:text-blue-300 text-sm"
                                                        title="Edit User"
                                                    >
                                                        Edit
                                                    </button>
                                                    <button
                                                        onClick={() => setShowDeleteConfirm(user)}
                                                        className="text-red-400 hover:text-red-300 text-sm"
                                                        title="Delete User"
                                                    >
                                                        Delete
                                                    </button>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-300">
                                                {user.employeeNumber || '-'}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-200">
                                                {user.name}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-300">
                                                {user.email}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-300">
                                                {user.role}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-300">
                                                {user.department}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                                    user.employeeStatus === 'permanent' ? 'bg-green-900/30 text-green-300' :
                                                    user.employeeStatus === 'probation' ? 'bg-yellow-900/30 text-yellow-300' :
                                                    'bg-blue-900/30 text-blue-300'
                                                }`}>
                                                    {user.employeeStatus || 'probation'}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {filteredUsersList.filter(u => !u.deleted).length === 0 && (
                                <div className="text-center py-8 text-slate-400">
                                    No users found matching your criteria.
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* 7. POLICY TAB */}
                {activeTab === 'policy' && (
                    <div className="p-6 space-y-6">
                        <LeavePolicyReference />
                        <div className="bg-muted p-6 rounded">
                            <h3 className="text-slate-200 mb-4">Bulk Balance Calculation</h3>
                            <p className="text-yellow-500 mb-4">Warning: This will overwrite all user balances based on join dates.</p>
                            <button onClick={calculateAllLeaveBalances} disabled={isCalculatingBalances} className="bg-orange-600 text-white px-4 py-2 rounded">
                                {isCalculatingBalances ? 'Calculating...' : 'Run Bulk Calculation'}
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Modals */}
            {showLeaveModal && <LeaveRequestModal userData={userData} onClose={() => setShowLeaveModal(false)} />}
            
            {showEditBalanceModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-slate-800 p-6 rounded-lg w-96">
                        <h3 className="text-xl text-white mb-4">Edit Balances: {editingUser?.name}</h3>
                        <div className="space-y-3">
                            <div>
                                <label className="block text-slate-300 text-sm mb-1">Annual Leave Balance (days)</label>
                                <input type="number" step="0.5" value={editBalanceData.annualLeave ?? 0} onChange={e => setEditBalanceData(prev => ({...prev, annualLeave: parseFloat(e.target.value) || 0}))} className="w-full bg-slate-700 text-white p-2 rounded" />
                            </div>
                            <div>
                                <label className="block text-slate-300 text-sm mb-1">Casual Leave Balance (days)</label>
                                <input type="number" step="0.5" value={editBalanceData.casualLeave ?? 0} onChange={e => setEditBalanceData(prev => ({...prev, casualLeave: parseFloat(e.target.value) || 0}))} className="w-full bg-slate-700 text-white p-2 rounded" />
                            </div>
                            <div>
                                <label className="block text-slate-300 text-sm mb-1">Sick Leave Balance (days)</label>
                                <input type="number" step="0.5" value={editBalanceData.sickLeave ?? 0} onChange={e => setEditBalanceData(prev => ({...prev, sickLeave: parseFloat(e.target.value) || 0}))} className="w-full bg-slate-700 text-white p-2 rounded" />
                            </div>
                            <div>
                                <label className="block text-slate-300 text-sm mb-1">Short Leave Balance (hours this month)</label>
                                <input type="number" step="0.5" min="0" max="3" value={editBalanceData.shortLeave ?? 0} onChange={e => setEditBalanceData(prev => ({...prev, shortLeave: parseFloat(e.target.value) || 0}))} className="w-full bg-slate-700 text-white p-2 rounded" />
                            </div>
                        </div>
                        <div className="mt-6 flex justify-end space-x-3">
                            <button onClick={() => setShowEditBalanceModal(false)} className="text-slate-400">Cancel</button>
                            <button onClick={saveBalanceChanges} className="bg-blue-600 text-white px-4 py-2 rounded">Save</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Add User Modal */}
            {showAddUserForm && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-card rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col mx-2 sm:mx-4">
                        <div className="p-6 overflow-y-auto flex-1">
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
                                    <label className="block text-sm font-medium text-slate-300 mb-1">Full Name *</label>
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
                                    <label className="block text-sm font-medium text-slate-300 mb-1">Email Address *</label>
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
                                    <label className="block text-sm font-medium text-slate-300 mb-1">Password *</label>
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
                                    <label className="block text-sm font-medium text-slate-300 mb-1">Department *</label>
                                    <select
                                        name="department"
                                        value={newUser.department}
                                        onChange={handleAddUserChange}
                                        required
                                        className="w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-200 bg-card"
                                    >
                                        <option value="">Select Department</option>
                                        <option value="Human Resources">Human Resources</option>
                                        <option value="Finance">Finance</option>
                                        <option value="Academic">Academic</option>
                                        <option value="Marketing">Marketing</option>
                                        <option value="Administration">Administration</option>
                                        <option value="IT">IT</option>
                                        <option value="Operations">Operations</option>
                                        <option value="Registrar">Registrar</option>
                                        <option value="Student Support">Student Support</option>
                                    </select>
                                </div>

                                <div className="mb-4">
                                    <label className="block text-sm font-medium text-slate-300 mb-1">Employee Number</label>
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
                                    <label className="block text-sm font-medium text-slate-300 mb-1">Designation</label>
                                    <input
                                        type="text"
                                        name="designation"
                                        value={newUser.designation}
                                        onChange={handleAddUserChange}
                                        className="w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-200 bg-card"
                                        placeholder="Enter designation"
                                    />
                                </div>

                                <div className="mb-4">
                                    <label className="block text-sm font-medium text-slate-300 mb-1">Gender</label>
                                    <select
                                        name="gender"
                                        value={newUser.gender}
                                        onChange={handleAddUserChange}
                                        className="w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-200 bg-card"
                                    >
                                        <option value="">Select Gender</option>
                                        <option value="male">Male</option>
                                        <option value="female">Female</option>
                                    </select>
                                </div>

                                <div className="mb-4">
                                    <label className="block text-sm font-medium text-slate-300 mb-1">Manager</label>
                                    <select
                                        name="managerId"
                                        value={newUser.managerId}
                                        onChange={handleAddUserChange}
                                        className="w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-200 bg-card"
                                    >
                                        <option value="">Select Manager (Optional)</option>
                                        {Object.values(users).filter(u => u.role !== 'Employee').map(manager => (
                                            <option key={manager.uid || manager.id} value={manager.uid || manager.id}>
                                                {manager.name} ({manager.role})
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="mb-4">
                                    <label className="block text-sm font-medium text-slate-300 mb-1">Employee Status</label>
                                    <select
                                        name="employeeStatus"
                                        value={newUser.employeeStatus}
                                        onChange={handleAddUserChange}
                                        className="w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-200 bg-card"
                                    >
                                        <option value="probation">Probation</option>
                                        <option value="permanent">Permanent</option>
                                        <option value="contract">Contract</option>
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

                                <div className="mb-4">
                                    <label className="block text-sm font-medium text-slate-300 mb-1">Birthday</label>
                                    <input
                                        type="date"
                                        name="birthday"
                                        value={newUser.birthday}
                                        onChange={handleAddUserChange}
                                        className="w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-200 bg-card"
                                    />
                                </div>
                                
                                <div className="flex justify-end space-x-3 mt-6">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setShowAddUserForm(false);
                                            setError('');
                                            setSuccess('');
                                        }}
                                        className="px-4 py-2 border border-gray-600 text-slate-300 rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    >
                                        Add User
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit User Modal */}
            {showEditUserModal && editingUserData && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-card rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col mx-2 sm:mx-4">
                        <div className="p-6 overflow-y-auto flex-1">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-lg font-medium text-slate-200">Edit User</h3>
                                <button
                                    onClick={() => {
                                        setShowEditUserModal(false);
                                        setEditingUserData(null);
                                        setError('');
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
                            
                            <form onSubmit={handleSaveUserEdit}>
                                <div className="mb-4">
                                    <label className="block text-sm font-medium text-slate-300 mb-1">Full Name *</label>
                                    <input
                                        type="text"
                                        name="name"
                                        value={editingUserData.name}
                                        onChange={handleEditUserChange}
                                        required
                                        className="w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-200 bg-card"
                                    />
                                </div>
                                
                                <div className="mb-4">
                                    <label className="block text-sm font-medium text-slate-300 mb-1">Email (Read-only)</label>
                                    <input
                                        type="email"
                                        value={editingUserData.email}
                                        disabled
                                        className="w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm text-slate-400 bg-muted cursor-not-allowed"
                                    />
                                </div>
                                
                                <div className="mb-4">
                                    <label className="block text-sm font-medium text-slate-300 mb-1">Department *</label>
                                    <select
                                        name="department"
                                        value={editingUserData.department}
                                        onChange={handleEditUserChange}
                                        required
                                        className="w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-200 bg-card"
                                    >
                                        <option value="">Select Department</option>
                                        <option value="Human Resources">Human Resources</option>
                                        <option value="Finance">Finance</option>
                                        <option value="Academic">Academic</option>
                                        <option value="Marketing">Marketing</option>
                                        <option value="Administration">Administration</option>
                                        <option value="IT">IT</option>
                                        <option value="Operations">Operations</option>
                                        <option value="Registrar">Registrar</option>
                                        <option value="Student Support">Student Support</option>
                                    </select>
                                </div>

                                <div className="mb-4">
                                    <label className="block text-sm font-medium text-slate-300 mb-1">Employee Number</label>
                                    <input
                                        type="text"
                                        name="employeeNumber"
                                        value={editingUserData.employeeNumber}
                                        onChange={handleEditUserChange}
                                        className="w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-200 bg-card"
                                    />
                                </div>

                                <div className="mb-4">
                                    <label className="block text-sm font-medium text-slate-300 mb-1">Designation</label>
                                    <input
                                        type="text"
                                        name="designation"
                                        value={editingUserData.designation}
                                        onChange={handleEditUserChange}
                                        className="w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-200 bg-card"
                                    />
                                </div>

                                <div className="mb-4">
                                    <label className="block text-sm font-medium text-slate-300 mb-1">Gender</label>
                                    <select
                                        name="gender"
                                        value={editingUserData.gender}
                                        onChange={handleEditUserChange}
                                        className="w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-200 bg-card"
                                    >
                                        <option value="">Select Gender</option>
                                        <option value="male">Male</option>
                                        <option value="female">Female</option>
                                    </select>
                                </div>

                                <div className="mb-4">
                                    <label className="block text-sm font-medium text-slate-300 mb-1">Manager</label>
                                    <select
                                        name="managerId"
                                        value={editingUserData.managerId}
                                        onChange={handleEditUserChange}
                                        className="w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-200 bg-card"
                                    >
                                        <option value="">Select Manager (Optional)</option>
                                        {Object.values(users).filter(u => u.role !== 'Employee' && (u.uid || u.id) !== editingUserData.uid).map(manager => (
                                            <option key={manager.uid || manager.id} value={manager.uid || manager.id}>
                                                {manager.name} ({manager.role})
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="mb-4">
                                    <label className="block text-sm font-medium text-slate-300 mb-1">Employee Status</label>
                                    <select
                                        name="employeeStatus"
                                        value={editingUserData.employeeStatus}
                                        onChange={handleEditUserChange}
                                        className="w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-200 bg-card"
                                    >
                                        <option value="probation">Probation</option>
                                        <option value="permanent">Permanent</option>
                                        <option value="contract">Contract</option>
                                    </select>
                                </div>

                                <div className="mb-4">
                                    <label className="block text-sm font-medium text-slate-300 mb-1">Joined Date</label>
                                    <input
                                        type="date"
                                        name="joinedDate"
                                        value={editingUserData.joinedDate}
                                        onChange={handleEditUserChange}
                                        className="w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-200 bg-card"
                                    />
                                </div>

                                <div className="mb-4">
                                    <label className="block text-sm font-medium text-slate-300 mb-1">Birthday</label>
                                    <input
                                        type="date"
                                        name="birthday"
                                        value={editingUserData.birthday}
                                        onChange={handleEditUserChange}
                                        className="w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-200 bg-card"
                                    />
                                </div>
                                
                                <div className="flex justify-end space-x-3 mt-6">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setShowEditUserModal(false);
                                            setEditingUserData(null);
                                            setError('');
                                        }}
                                        className="px-4 py-2 border border-gray-600 text-slate-300 rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    >
                                        Save Changes
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Dialog */}
            {showDeleteConfirm && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-card rounded-lg shadow-xl w-full max-w-md p-6">
                        <h3 className="text-lg font-medium text-slate-200 mb-4">Confirm Delete</h3>
                        <p className="text-slate-300 mb-6">
                            Are you sure you want to delete user <strong>{showDeleteConfirm.name}</strong>? This action will mark the user as deleted.
                        </p>
                        <div className="flex justify-end space-x-3">
                            <button
                                onClick={() => setShowDeleteConfirm(null)}
                                className="px-4 py-2 border border-gray-600 text-slate-300 rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => handleDeleteUser(showDeleteConfirm.uid || showDeleteConfirm.id)}
                                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                            >
                                Delete User
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}