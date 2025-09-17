import React, { useState, useEffect } from 'react';
import { getFirestore, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { app } from '../lib/firebase-client';
import { LEAVE_TYPES, getFilteredLeaveTypes } from '../lib/leaveTypes';

const db = getFirestore(app);

export default function LeaveRequestModal({ userData, onClose }) {
    const [type, setType] = useState('Annual Leave');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [startTime, setStartTime] = useState('');
    const [endTime, setEndTime] = useState('');
    const [reason, setReason] = useState('');
    const [error, setError] = useState('');
    const [totalDays, setTotalDays] = useState(0);
    const [totalHours, setTotalHours] = useState(0);
    const [leaveUnits, setLeaveUnits] = useState(0);

    // Filter leave types based on user's gender using shared configuration
    const filteredLeaveTypes = getFilteredLeaveTypes(userData.gender);

    // Calculate total days with Saturday = 0.5 days, exclude Sundays
    useEffect(() => {
        if (startDate && endDate) {
            const start = new Date(startDate);
            const end = new Date(endDate);
            if (end >= start) {
                let workingDays = 0;
                const currentDate = new Date(start);
                
                while (currentDate <= end) {
                    const dayOfWeek = currentDate.getDay();
                    
                    if (dayOfWeek === 0) {
                        // Sunday - don't count
                    } else if (dayOfWeek === 6) {
                        // Saturday - count as half day
                        workingDays += 0.5;
                    } else {
                        // Monday-Friday - count as full day
                        workingDays += 1;
                    }
                    currentDate.setDate(currentDate.getDate() + 1);
                }
                
                setTotalDays(workingDays);
            } else {
                setTotalDays(0);
            }
        } else {
            setTotalDays(0);
        }
    }, [startDate, endDate]);

    // Calculate total hours and leave units when time changes
    useEffect(() => {
        if (startTime && endTime) {
            const [startHour, startMin] = startTime.split(':').map(Number);
            const [endHour, endMin] = endTime.split(':').map(Number);
            
            const startMinutes = startHour * 60 + startMin;
            const endMinutes = endHour * 60 + endMin;
            
            if (endMinutes > startMinutes) {
                const diffMinutes = endMinutes - startMinutes;
                const hours = Math.round((diffMinutes / 60) * 100) / 100; // Round to 2 decimal places
                setTotalHours(hours);
                
                // Calculate leave units based on hours
                let units = 0;
                if (hours > 2 && hours < 4) {
                    units = 0.5; // Half day
                } else if (hours >= 4) {
                    units = 1; // Full day
                }
                setLeaveUnits(units);
            } else {
                setTotalHours(0);
                setLeaveUnits(0);
            }
        } else {
            setTotalHours(0);
            setLeaveUnits(0);
        }
    }, [startTime, endTime]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        // Basic validation
        if (!startDate || !endDate) {
            setError('Please select both start and end dates.');
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

        // Validate time fields if provided
        if (startTime && !endTime) {
            setError('Please select end time.');
            return;
        }
        
        if (!startTime && endTime) {
            setError('Please select start time.');
            return;
        }

        // Validate business hours (8am - 5pm)
        if (startTime || endTime) {
            const validateTime = (timeStr) => {
                const [hour] = timeStr.split(':').map(Number);
                return hour >= 8 && hour <= 17;
            };
            
            if (startTime && !validateTime(startTime)) {
                setError('Start time must be between 8:00 AM and 5:00 PM.');
                return;
            }
            
            if (endTime && !validateTime(endTime)) {
                setError('End time must be between 8:00 AM and 5:00 PM.');
                return;
            }
        }

        try {
            const requestData = {
                userId: userData.uid,
                userName: userData.name,
                managerId: userData.managerId,
                department: userData.department,
                type,
                startDate: new Date(startDate),
                endDate: new Date(endDate),
                reason: reason || '',
                status: 'Pending',
                appliedOn: serverTimestamp(),
                totalDays: totalDays,
            };
            
            // Add time-based fields if provided
            if (startTime && endTime) {
                requestData.startTime = startTime;
                requestData.endTime = endTime;
                requestData.totalHours = totalHours;
                requestData.leaveUnits = leaveUnits;
                requestData.isPartialDay = leaveUnits < totalDays;
            } else {
                requestData.leaveUnits = totalDays;
                requestData.isPartialDay = false;
            }
            
            await addDoc(collection(db, "leaveRequests"), requestData);
            onClose();
        } catch (err) {
            console.error("Error submitting leave request:", err);
            setError('Failed to submit request. Please try again.');
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4">
            <div className="bg-card rounded-lg shadow-xl w-full max-w-lg">
                <div className="p-6">
                    <h2 className="text-xl font-bold text-slate-200 mb-4">Apply for Leave</h2>
                    {error && <div className="mb-4 text-red-400 bg-red-900/30 p-3 rounded">{error}</div>}
                    <form onSubmit={handleSubmit}>
                        {/* Leave Type */}
                        <div className="mb-4">
                            <label className="block text-sm font-medium text-slate-300 mb-1">Leave Type</label>
                            <select
                                value={type}
                                onChange={(e) => setType(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-card text-slate-200"
                            >
                                {filteredLeaveTypes.map((leaveType, index) => (
                                    <option key={index} value={leaveType.value}>{leaveType.label}</option>
                                ))}
                            </select>
                        </div>

                        {/* Date Selection */}
                        <div className="mb-4">
                            <label className="block text-sm font-medium text-slate-300 mb-2">Date Range</label>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs text-slate-400 mb-1">From</label>
                                    <input
                                        type="date"
                                        value={startDate}
                                        onChange={(e) => setStartDate(e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-card text-slate-200"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-slate-400 mb-1">To</label>
                                    <input
                                        type="date"
                                        value={endDate}
                                        onChange={(e) => setEndDate(e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-card text-slate-200"
                                        required
                                    />
                                </div>
                            </div>
                            {totalDays > 0 && (
                                <div className="mt-2 text-sm text-slate-300 bg-blue-900/20 p-2 rounded">
                                    <strong>Working Days: {totalDays}</strong>
                                    <div className="text-xs text-slate-400 mt-1">
                                        (Sundays excluded, Saturdays = 0.5 days)
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Time Selection */}
                        <div className="mb-4">
                            <label className="block text-sm font-medium text-slate-300 mb-2">Time Range (Optional)</label>
                            
                            {totalDays > 1 ? (
                                <div className="text-sm text-slate-400 bg-gray-900/30 p-3 rounded">
                                    Time range selection is disabled for multi-day leave requests.
                                </div>
                            ) : (
                                <>
                                    <div className="text-xs text-slate-400 mb-2">Business hours: 8:00 AM - 5:00 PM only</div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs text-slate-400 mb-1">From</label>
                                            <input
                                                type="time"
                                                value={startTime}
                                                onChange={(e) => setStartTime(e.target.value)}
                                                min="08:00"
                                                max="17:00"
                                                step="1800"
                                                className="w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-card text-slate-200"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs text-slate-400 mb-1">To</label>
                                            <input
                                                type="time"
                                                value={endTime}
                                                onChange={(e) => setEndTime(e.target.value)}
                                                min="08:00"
                                                max="17:00"
                                                step="1800"
                                                className="w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-card text-slate-200"
                                            />
                                        </div>
                                    </div>
                                </>
                            )}
                            {totalHours > 0 && (
                                <div className="mt-2 space-y-1">
                                    <div className="text-sm text-slate-300 bg-green-900/20 p-2 rounded">
                                        <strong>Total Hours: {totalHours}</strong>
                                    </div>
                                    {leaveUnits > 0 && (
                                        <div className="text-sm text-slate-300 bg-purple-900/20 p-2 rounded">
                                            <strong>
                                                Leave Deduction: {leaveUnits} {leaveUnits === 0.5 ? 'half day' : leaveUnits === 1 ? 'full day' : 'days'}
                                            </strong>
                                            {totalHours > 2 && totalHours < 4 && (
                                                <div className="text-xs text-slate-400 mt-1">
                                                    (2-4 hours = half day)
                                                </div>
                                            )}
                                            {totalHours >= 4 && (
                                                <div className="text-xs text-slate-400 mt-1">
                                                    (4+ hours = full day)
                                                </div>
                                            )}
                                        </div>
                                    )}
                                    {totalHours > 0 && totalHours <= 2 && (
                                        <div className="text-sm text-yellow-300 bg-yellow-900/20 p-2 rounded">
                                            <strong>No leave deduction for ≤2 hours</strong>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Reason */}
                        <div className="mb-6">
                            <label className="block text-sm font-medium text-slate-300 mb-1">Reason (Optional)</label>
                            <textarea
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-card text-slate-200"
                                rows="3"
                                placeholder="Enter reason for leave (optional)"
                            ></textarea>
                        </div>

                        {/* Action Buttons */}
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
