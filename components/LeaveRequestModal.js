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

    // New state for granular date selection
    const [useGranularSelection, setUseGranularSelection] = useState(false);
    const [dateConfigurations, setDateConfigurations] = useState({});

    // Filter leave types based on user's gender using shared configuration
    const filteredLeaveTypes = getFilteredLeaveTypes(userData.gender);

    // Generate array of dates between start and end date
    const getDatesInRange = (start, end) => {
        const dates = [];
        const currentDate = new Date(start);
        const endDate = new Date(end);

        while (currentDate <= endDate) {
            const dateStr = currentDate.toISOString().split('T')[0];
            dates.push(dateStr);
            currentDate.setDate(currentDate.getDate() + 1);
        }

        return dates;
    };

    // Get all dates in the selected range
    const selectedDates = startDate && endDate ? getDatesInRange(startDate, endDate) : [];

    // Handle date configuration change
    const handleDateConfigurationChange = (date, configuration) => {
        setDateConfigurations(prev => ({
            ...prev,
            [date]: configuration
        }));
    };

    // Calculate total leave units from granular selections
    const calculateGranularLeaveUnits = () => {
        let totalUnits = 0;

        selectedDates.forEach(date => {
            const config = dateConfigurations[date];
            if (config) {
                const { type: dayType, startTime: dayStartTime, endTime: dayEndTime } = config;

                if (dayType === 'full') {
                    totalUnits += 1;
                } else if (dayType === 'half') {
                    // 08:30–10:00 and 15:30–17:00 are Short Leave windows and are NOT counted as half day
                    const isShortWindow =
                        (dayStartTime === '08:30' && dayEndTime === '10:00') ||
                        (dayStartTime === '15:30' && dayEndTime === '17:00');

                    if (isShortWindow) {
                        totalUnits += 0; // do not count half day for short leave windows
                    } else {
                        totalUnits += 0.5;
                    }
                } else if (dayType === 'na') {
                    // Not Applicable: no deduction
                    totalUnits += 0;
                } else if (dayType === 'short' && dayStartTime && dayEndTime) {
                    // Short Leave is strictly one of the two windows: 08:30-10:00 or 15:30-17:00
                    const validWindow =
                        (dayStartTime === '08:30' && dayEndTime === '10:00') ||
                        (dayStartTime === '15:30' && dayEndTime === '17:00');

                    if (validWindow) {
                        totalUnits += 1; // consume one short leave unit
                    } else {
                        totalUnits += 0; // invalid window → no deduction
                    }
                }
            } else {
                // Default to full day if no configuration
                totalUnits += 1;
            }
        });

        return totalUnits;
    };

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

                let units = 0;

                if (type === 'Short Leave') {
                    // Short Leave is allowed ONLY for exact windows: 08:30-10:00 or 15:30-17:00
                    const validWindow =
                        (startTime === '08:30' && endTime === '10:00') ||
                        (startTime === '15:30' && endTime === '17:00');

                    units = validWindow ? 1 : 0; // invalid window → no deduction here; submit handler will show error
                } else {
                    // For non-short types, the Short Leave windows are NOT counted as half day
                    const isShortWindow =
                        (startTime === '08:30' && endTime === '10:00') ||
                        (startTime === '15:30' && endTime === '17:00');

                    if (isShortWindow) {
                        units = 0; // do not count as half day
                    } else {
                        // Check if time range includes 12:30 PM (half day marker)
                        const startTimeStr = startTime;
                        const endTimeStr = endTime;
                        const isHalfDayStart = startTimeStr === "12:30";
                        const isHalfDayEnd = endTimeStr === "12:30";

                        if (isHalfDayStart || isHalfDayEnd) {
                            units = 0.5;
                        } else if (hours < 1.5) {
                            units = 0;
                        } else if (hours >= 1.5 && hours < 4) {
                            units = 0.5;
                        } else if (hours >= 4) {
                            units = 1;
                        }
                    }
                }

                // Do not multiply Short Leave by totalDays; Short Leave is per window
                if (totalDays > 1 && startTime && endTime && type !== 'Short Leave') {
                    units = units * totalDays;
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
    }, [startTime, endTime, type, totalDays]);

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

            // Enforce Short Leave windows: not counted as half-day under other types
            if (!useGranularSelection && startTime && endTime) {
                const isShortWindow =
                    (startTime === '08:30' && endTime === '10:00') ||
                    (startTime === '15:30' && endTime === '17:00');
                if (isShortWindow && type !== 'Short Leave') {
                    setError('08:30–10:00 and 15:30–17:00 are reserved for Short Leave and are not counted as a half day. Please select "Short Leave" as the leave type.');
                    return;
                }
            }
        }

        try {
            let finalLeaveUnits;

            if (useGranularSelection) {
                // Use granular calculation
                finalLeaveUnits = calculateGranularLeaveUnits();
            } else {
                // Use simple calculation
                if (startTime && endTime) {
                    finalLeaveUnits = leaveUnits;
                } else {
                    finalLeaveUnits = totalDays;
                }
            }

            // Short Leave rule: strictly fixed 1.5h windows reduce 1 shortLeave unit
            if (type === 'Short Leave') {
                if (useGranularSelection) {
                    // In granular mode, calculateGranularLeaveUnits() already counted 1 per valid short window
                    // Do not ceil; it returns an integer count of valid short days
                } else {
                    if (totalDays !== 1) {
                        setError('Short Leave must be for a single day.');
                        return;
                    }
                    if (!startTime || !endTime) {
                        setError('Please select the Short Leave time range.');
                        return;
                    }
                    const validWindow =
                        (startTime === '08:30' && endTime === '10:00') ||
                        (startTime === '15:30' && endTime === '17:00');

                    if (!validWindow) {
                        setError('Short Leave must be exactly 08:30–10:00 or 15:30–17:00.');
                        return;
                    }
                    finalLeaveUnits = 1; // consume one short leave
                }
            }

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
                leaveUnits: finalLeaveUnits,
                isGranularSelection: useGranularSelection,
            };

            // Add granular configuration if used
            if (useGranularSelection) {
                requestData.dateConfigurations = dateConfigurations;
            }

            // Add time-based fields if provided (for simple mode)
            if (!useGranularSelection && startTime && endTime) {
                requestData.startTime = startTime;
                requestData.endTime = endTime;
                requestData.totalHours = totalHours;
                requestData.isPartialDay = finalLeaveUnits < totalDays;
            } else {
                requestData.isPartialDay = finalLeaveUnits < totalDays;
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
            <div className="bg-card rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col mx-2 sm:mx-4">
                <div className="p-6 overflow-y-auto flex-1">
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

                        {/* Date Selection Mode Toggle */}
                        <div className="mb-4">
                            <label className="block text-sm font-medium text-slate-300 mb-2">Leave Planning Mode</label>
                            <div className="flex space-x-4">
                                <label className="flex items-center">
                                    <input
                                        type="radio"
                                        name="selectionMode"
                                        checked={!useGranularSelection}
                                        onChange={() => setUseGranularSelection(false)}
                                        className="mr-2"
                                    />
                                    <span className="text-sm text-slate-300">Simple Range</span>
                                </label>
                                <label className="flex items-center">
                                    <input
                                        type="radio"
                                        name="selectionMode"
                                        checked={useGranularSelection}
                                        onChange={() => setUseGranularSelection(true)}
                                        className="mr-2"
                                    />
                                    <span className="text-sm text-slate-300">Detailed Planning</span>
                                </label>
                            </div>
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
                            {totalDays > 0 && !useGranularSelection && (
                                <div className="mt-2 text-sm text-slate-300 bg-blue-900/20 p-2 rounded">
                                    <strong>Working Days: {totalDays}</strong>
                                    <div className="text-xs text-slate-400 mt-1">
                                        (Sundays excluded, Saturdays = 0.5 days)
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Granular Date Selection */}
                        {useGranularSelection && selectedDates.length > 0 && (
                            <div className="mb-4">
                                <label className="block text-sm font-medium text-slate-300 mb-2">Configure Each Day</label>
                                <div className="space-y-2 max-h-60 overflow-y-auto">
                                    {selectedDates.map((date, index) => {
                                        const dateObj = new Date(date);
                                        const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'long' });
                                        const config = dateConfigurations[date] || {};

                                        return (
                                            <div key={date} className="bg-muted p-3 rounded border border-gray-600">
                                                <div className="flex justify-between items-center mb-2">
                                                    <div>
                                                        <strong className="text-slate-200">
                                                            {dayName}, {dateObj.toLocaleDateString()}
                                                        </strong>
                                                    </div>
                                                    <select
                                                        value={config.type || 'full'}
                                                        onChange={(e) => handleDateConfigurationChange(date, {
                                                            ...config,
                                                            type: e.target.value
                                                        })}
                                                        className="px-2 py-1 border border-gray-600 rounded text-xs bg-card text-slate-200"
                                                    >
                                                        <option value="full">Full Day</option>
                                                        <option value="half">Half Day</option>
                                                        <option value="short">Short Leave</option>
                                                        <option value="na">Not Applicable</option>
                                                    </select>
                                                </div>

                                                {config.type === 'short' && (
                                                    <div className="grid grid-cols-2 gap-2">
                                                        <div>
                                                            <label className="block text-xs text-slate-400 mb-1">Start Time</label>
                                                            <input
                                                                type="time"
                                                                value={config.startTime || ''}
                                                                onChange={(e) => handleDateConfigurationChange(date, {
                                                                    ...config,
                                                                    startTime: e.target.value
                                                                })}
                                                                min="08:00"
                                                                max="17:00"
                                                                className="w-full px-2 py-1 border border-gray-600 rounded text-xs bg-card text-slate-200"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="block text-xs text-slate-400 mb-1">End Time</label>
                                                            <input
                                                                type="time"
                                                                value={config.endTime || ''}
                                                                onChange={(e) => handleDateConfigurationChange(date, {
                                                                    ...config,
                                                                    endTime: e.target.value
                                                                })}
                                                                min="08:00"
                                                                max="17:00"
                                                                className="w-full px-2 py-1 border border-gray-600 rounded text-xs bg-card text-slate-200"
                                                            />
                                                        </div>
                                                    </div>
                                                )}

                                                {config.type === 'half' && (
                                                    <div className="grid grid-cols-2 gap-2">
                                                        <div>
                                                            <label className="block text-xs text-slate-400 mb-1">Start Time</label>
                                                            <input
                                                                type="time"
                                                                value={config.startTime || ''}
                                                                onChange={(e) => handleDateConfigurationChange(date, {
                                                                    ...config,
                                                                    startTime: e.target.value
                                                                })}
                                                                min="08:00"
                                                                max="17:00"
                                                                className="w-full px-2 py-1 border border-gray-600 rounded text-xs bg-card text-slate-200"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="block text-xs text-slate-400 mb-1">End Time</label>
                                                            <input
                                                                type="time"
                                                                value={config.endTime || ''}
                                                                onChange={(e) => handleDateConfigurationChange(date, {
                                                                    ...config,
                                                                    endTime: e.target.value
                                                                })}
                                                                min="08:00"
                                                                max="17:00"
                                                                className="w-full px-2 py-1 border border-gray-600 rounded text-xs bg-card text-slate-200"
                                                            />
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Granular Selection Summary */}
                                <div className="mt-3 p-3 bg-green-900/20 border border-green-500/30 rounded">
                                    <div className="text-sm text-green-300">
                                        <strong>Total Leave Days: {calculateGranularLeaveUnits()}</strong>
                                    </div>
                                    <div className="text-xs text-green-400 mt-1">
                                        Based on your day-by-day configuration
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Time Selection - Only for Simple Mode and Single Day */}
                        {!useGranularSelection && totalDays === 1 && (
                            <div className="mb-4">
                                <label className="block text-sm font-medium text-slate-300 mb-2">Time Range (Optional)</label>
                                <div className="text-xs text-slate-400 mb-2">
                                    Select time range for half-day requests or to specify exact hours
                                </div>

                                <div className="text-xs text-slate-400 mb-2">
                                    Business hours: 8:00 AM - 5:00 PM only<br/>
                                    <span className="text-blue-400">💡 Tip: 12:30 PM is the half-day boundary</span><br/>
                                    <span className="text-rose-300">Note: 08:30–10:00 or 15:30–17:00 are Short Leave windows and are not counted as a half day.</span>
                                </div>
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
                                {totalHours > 0 && (
                                    <div className="mt-2 space-y-1">
                                        <div className="text-sm text-slate-300 bg-green-900/20 p-2 rounded">
                                            <strong>Total Hours: {totalHours}</strong>
                                        </div>
                                        {leaveUnits > 0 && (
                                            <div className="text-sm text-slate-300 bg-purple-900/20 p-2 rounded">
                                                {type === 'Short Leave' ? (
                                                    <>
                                                        <strong>Short Leave Units: {leaveUnits}</strong>
                                                        <div className="text-xs text-slate-400 mt-1">
                                                            (Valid windows: 08:30–10:00 or 15:30–17:00)
                                                        </div>
                                                    </>
                                                ) : (
                                                    <>
                                                        <strong>
                                                            Leave Deduction: {leaveUnits} {leaveUnits === 0.5 ? 'half day' : leaveUnits === 1 ? 'full day' : 'days'}
                                                        </strong>
                                                        {totalHours < 1.5 && (
                                                            <div className="text-xs text-slate-400 mt-1">
                                                                (Less than 1.5 hours = no deduction)
                                                            </div>
                                                        )}
                                                        {totalHours >= 1.5 && totalHours < 4 && (
                                                            <div className="text-xs text-slate-400 mt-1">
                                                                (1.5-4 hours = half day)
                                                            </div>
                                                        )}
                                                        {totalHours >= 4 && (
                                                            <div className="text-xs text-slate-400 mt-1">
                                                                (4+ hours = full day)
                                                            </div>
                                                        )}
                                                    </>
                                                )}
                                            </div>
                                        )}
                                        {totalHours > 0 && totalHours < 1.5 && (
                                            <div className="text-sm text-green-300 bg-green-900/20 p-2 rounded">
                                                <strong>Short leave - No leave deduction</strong>
                                                <div className="text-xs text-green-400 mt-1">
                                                    (Less than 1.5 hours)
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Multi-day Time Selection Notice */}
                        {!useGranularSelection && totalDays > 1 && (
                            <div className="mb-4">
                                <div className="text-sm text-slate-400 bg-gray-900/30 p-3 rounded border border-gray-600">
                                    <div className="flex items-center space-x-2">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                                        </svg>
                                        <span><strong>Multi-day request detected</strong></span>
                                    </div>
                                    <p className="text-xs text-slate-400 mt-1">
                                        Time selection is disabled for multi-day requests in simple mode.
                                        Use "Detailed Planning" mode for day-by-day time configuration.
                                    </p>
                                </div>
                            </div>
                        )}

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
