import React from 'react';
import { LEAVE_BALANCE_TYPES, getFilteredLeaveBalanceTypes, getLeaveAllocation } from '../lib/leaveTypes';

export default function LeaveBalanceCard({ balances, gender, userData }) {
    if (!balances) {
        return null;
    }

    // Filter leave types based on gender using shared configuration
    const filteredLeaveTypes = getFilteredLeaveBalanceTypes(gender);

    const formatLeaveBalance = (type) => {
        const remaining = balances[type.key] || 0;
        const standardAllocation = getLeaveAllocation(type.key, userData);
        
        // Skip leave types with no remaining balance and no standard allocation
        if (remaining === 0 && standardAllocation === 0) {
            return null; // Don't display this leave type
        }
        
        // Helper function to format numbers (show decimals only if needed)
        const formatNumber = (num) => {
            return num % 1 === 0 ? num.toString() : num.toFixed(1);
        };
        
        // Helper function to format day/days text
        const formatDaysText = (num) => {
            const formatted = formatNumber(num);
            return num === 1 ? `${formatted} day` : `${formatted} days`;
        };
        
        // For leave types with no standard allocation but have remaining days
        if (standardAllocation === 0) {
            return {
                mainNumber: formatDaysText(remaining),
                mainLabel: 'available',
                sub: '',
                showProgress: false,
                shouldDisplay: remaining > 0
            };
        }
        
        // If remaining balance is higher than standard allocation, use remaining as the base
        // This handles cases where users might have carried over leave or have different allocations
        const actualTotal = Math.max(remaining, standardAllocation);
        const used = Math.max(0, actualTotal - remaining);
        
        // Calculate percentage for progress indication
        const percentageUsed = actualTotal > 0 ? (used / actualTotal) * 100 : 0;
        
        return {
            mainNumber: formatDaysText(remaining),
            mainLabel: 'Remaining',
            sub: `${formatDaysText(actualTotal)} total`,
            showProgress: true,
            percentage: percentageUsed,
            status: remaining <= 2 && remaining > 0 ? 'low' : 'good',
            shouldDisplay: true
        };
    };

    const getProgressColor = (status) => {
        switch(status) {
            case 'low': return 'bg-yellow-500';
            default: return 'bg-green-500';
        }
    };

    // Filter out leave types that shouldn't be displayed
    const displayableLeaveTypes = filteredLeaveTypes
        .map(type => ({ ...type, balance: formatLeaveBalance(type) }))
        .filter(type => type.balance && type.balance.shouldDisplay);

    return (
        <div className="bg-card p-6 rounded-lg shadow-sm">
            <h2 className="text-xl font-semibold text-slate-200 mb-4">My Leave Balance</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {displayableLeaveTypes.map((type, index) => {
                    const balance = type.balance;
                    return (
                        <div key={index} className={`${type.bgColor} p-5 rounded-lg border border-opacity-20 border-gray-600 relative`}>
                            {/* Status Badge - positioned absolute for centered title */}
                            {balance.status === 'low' && (
                                <div className="absolute top-3 right-3">
                                    <span className="text-xs bg-yellow-500/20 text-yellow-300 px-2 py-1 rounded-full">
                                        Low
                                    </span>
                                </div>
                            )}
                            
                            {/* Leave Type Name */}
                            <div className="text-center mb-6">
                                <p className={`text-base font-semibold ${type.textColor}`}>{type.label}</p>
                            </div>
                            
                            {/* Remaining Days - Large Display */}
                            <div className="text-center mb-4">
                                <p className={`text-2xl font-bold ${type.titleColor}`}>
                                    {balance.mainNumber}
                                </p>
                                <p className={`text-sm ${type.textColor} opacity-90 font-medium`}>
                                    {balance.mainLabel}
                                </p>
                            </div>
                            
                            {/* Total Days - Smaller Display */}
                            <div className="text-center">
                                <p className={`text-sm ${type.textColor} opacity-90 font-medium`}>
                                    {balance.sub}
                                </p>
                            </div>
                            
                            {balance.showProgress && (
                                <div className="mt-4">
                                    <div className="w-full bg-gray-700 rounded-full h-2.5">
                                        <div
                                            className={`h-2.5 rounded-full ${getProgressColor(balance.status)} transition-all duration-300`}
                                            style={{ width: `${Math.min(100, balance.percentage)}%` }}
                                        ></div>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
