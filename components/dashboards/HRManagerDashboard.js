import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getFirestore, collection, onSnapshot, doc, updateDoc, getDoc } from 'firebase/firestore';
import { app } from '../../lib/firebase-client';
import ManagerRequestsTable from '../ManagerRequestsTable';
import LeaveHistoryTable from '../LeaveHistoryTable';
import LeaveRequestModal from '../LeaveRequestModal';
import MyLeaveSection from '../MyLeaveSection';
import { LEAVE_TYPE_MAP, validateLeaveType } from '../../lib/leaveTypes';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

const db = getFirestore(app);

// Leave type mapping is now imported from shared configuration

export default function HRManagerDashboard() {
    const { userData } = useAuth();
    const [allRequests, setAllRequests] = useState([]);
    const [users, setUsers] = useState({});
    const [message, setMessage] = useState(null);
    const [activeTab, setActiveTab] = useState('requests');
    const [showLeaveModal, setShowLeaveModal] = useState(false);
    const [activeReportTab, setActiveReportTab] = useState('generate');
    const [monthlyReport, setMonthlyReport] = useState(null);
    const [isGeneratingReport, setIsGeneratingReport] = useState(false);

    useEffect(() => {
        const usersUnsubscribe = onSnapshot(collection(db, 'users'), (snapshot) => {
            const usersData = {};
            snapshot.forEach(doc => usersData[doc.id] = doc.data());
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
                await updateDoc(requestRef, {
                    hrManagerApproval: 'Approved',
                    status: 'Approved',
                    hrManagerActionBy: userData.name,
                    rejectionReason: ''
                });

                // Validate request data
                if (!request.userId || !request.type || !request.startDate || !request.endDate) {
                    throw new Error('Invalid request data');
                }

                const userRef = doc(db, "users", request.userId);
                const userDoc = await getDoc(userRef);
                if (userDoc.exists()) {
                    const currentData = userDoc.data();
                    // Convert leave type name to match the balance structure
                    const leaveType = LEAVE_TYPE_MAP[request.type] || request.type.toLowerCase().replace(' ', '');

                    // Validate leave type using shared function
                    validateLeaveType(leaveType, currentData.gender);

                    // Debug: Log available leave balance keys
                    console.log('User leave balance keys:', Object.keys(currentData.leaveBalance || {}));
                    console.log('Looking for leave type:', leaveType);
                    console.log('Request type:', request.type);

                    // Validate leave type exists in user's balance, if not initialize it to 0
                    if (!currentData.leaveBalance || !currentData.leaveBalance.hasOwnProperty(leaveType)) {
                        // Initialize missing leave type to 0
                        if (!currentData.leaveBalance) {
                            currentData.leaveBalance = {};
                        }
                        currentData.leaveBalance[leaveType] = 0;
                        
                        // Update user document with the missing leave type
                        await updateDoc(userRef, {
                            [`leaveBalance.${leaveType}`]: 0
                        });
                    }
                    
                    const currentBalance = currentData.leaveBalance[leaveType];
                    const startDate = request.startDate.toDate();
                    const endDate = request.endDate.toDate();
                    
                    // Validate dates
                    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime()) || endDate < startDate) {
                        throw new Error('Invalid date range');
                    }
                    
                    // Use leaveUnits if available (for half-day support), otherwise calculate from dates
                    let duration;
                    if (request.leaveUnits !== undefined && request.leaveUnits > 0) {
                        duration = request.leaveUnits;
                    } else {
                        // Fallback to date calculation for older requests
                        duration = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
                    }
                    
                    console.log('HR Manager deducting leave:', {
                        leaveType,
                        duration,
                        leaveUnits: request.leaveUnits,
                        currentBalance,
                        isPartialDay: request.isPartialDay
                    });
                    
                    // Check if user has enough leave balance
                    if (currentBalance < duration) {
                        throw new Error('Insufficient leave balance');
                    }
                    
                    await updateDoc(userRef, {
                        [`leaveBalance.${leaveType}`]: currentBalance - duration
                    });
                }
            } else {
                await updateDoc(requestRef, {
                    hrManagerApproval: 'Rejected',
                    status: 'Rejected',
                    hrManagerActionBy: userData.name,
                    rejectionReason: rejectionReason?.trim() || ''
                });
            }
            
            setMessage({ type: 'success', text: `Leave request ${newStatus.toLowerCase()} successfully.` });
        } catch (error) {
            console.error("Error handling final approval:", error);
            setMessage({ type: 'error', text: `Error ${newStatus.toLowerCase()}ing leave request: ${error.message}` });
        }
    };

    const pendingHRRequests = allRequests.filter(r => r.status === 'Pending HR Approval');

    // Function to generate monthly report (25th to 25th)
    const generateMonthlyReport = async () => {
        setIsGeneratingReport(true);
        try {
            const now = new Date();
            const currentYear = now.getFullYear();
            const currentMonth = now.getMonth();

            // Calculate date range: 25th of previous month to 25th of current month
            const startDate = new Date(currentYear, currentMonth - 1, 25);
            const endDate = new Date(currentYear, currentMonth, 25);

            // If we're before the 25th of current month, adjust the range
            if (now.getDate() < 25) {
                startDate.setMonth(currentMonth - 2);
                endDate.setMonth(currentMonth - 1);
                endDate.setDate(25);
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

    // Function to format leave balance display
    const formatLeaveBalance = (balance) => {
        if (balance === undefined || balance === null) return '0';
        // Show decimals only if needed (e.g., 7.5 instead of 7.50, but 7 instead of 7.0)
        return balance % 1 === 0 ? balance.toString() : balance.toFixed(1);
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
                        Requests for Final Approval ({pendingHRRequests.length})
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
                        <ManagerRequestsTable requests={pendingHRRequests} users={users} onUpdate={handleFinalApproval} />
                    </div>
                )}
                
                {activeTab === 'balances' && (
                    <div className="p-6">
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-700">
                                <thead className="bg-muted">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Employee</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Department</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Annual Leave</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Sick Leave</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Casual Leave</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Maternity Leave</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Paternity Leave</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Leave in-lieu</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Short Leave</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Other</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-card divide-y divide-gray-700">
                                    {Object.values(users).map(user => (
                                        <tr key={user.uid || user.id}>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-200">{user.name}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400">{user.department || 'N/A'}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400">{formatLeaveBalance(user.leaveBalance?.annualLeave)}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400">{formatLeaveBalance(user.leaveBalance?.sickLeave)}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400">{formatLeaveBalance(user.leaveBalance?.casualLeave)}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400">{formatLeaveBalance(user.leaveBalance?.maternityLeave)}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400">{formatLeaveBalance(user.leaveBalance?.paternityLeave)}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400">{formatLeaveBalance(user.leaveBalance?.['leave in-lieu'])}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400">{formatLeaveBalance(user.leaveBalance?.shortLeave)}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400">{formatLeaveBalance(user.leaveBalance?.other)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
                
                {activeTab === 'history' && (
                    <div className="p-6">
                        <LeaveHistoryTable requests={allRequests} users={users} isAdminView={true} />
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
                                    <p className="text-slate-400 mb-6">
                                        Generate a comprehensive report of all leave requests from the 25th of the previous month to the 25th of the current month.
                                    </p>
                                    <button
                                        onClick={generateMonthlyReport}
                                        disabled={isGeneratingReport}
                                        className="bg-blue-600 text-white px-6 py-3 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {isGeneratingReport ? 'Generating Report...' : 'Generate Monthly Report'}
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
                                        <div className="overflow-x-auto">
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


                                    {/* Detailed Request List */}
                                    <div>
                                        <h4 className="text-md font-medium text-slate-200 mb-4">Detailed Request List</h4>
                                        <div className="overflow-x-auto">
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
            </div>
            
            {/* Leave Request Modal */}
            {showLeaveModal && (
                <LeaveRequestModal
                    userData={userData}
                    onClose={() => setShowLeaveModal(false)}
                />
            )}
        </div>
    );
};
