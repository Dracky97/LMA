import React from 'react';
import { LEAVE_BALANCE_TYPES, getFilteredLeaveBalanceTypes } from '../lib/leaveTypes';

export default function LeaveBalanceCard({ balances, gender, userData }) {
    if (!balances) {
        return null;
    }

    // Check if user is currently on no pay status
    const isOnNoPay = userData?.noPayStatus || false;

    // Filter leave types based on gender using shared configuration
    const filteredLeaveTypes = getFilteredLeaveBalanceTypes(gender);

    const formatLeaveBalance = (type) => {
        const remaining = balances[type.key] || 0;
        const allocation = userData?.leaveAllocations?.[type.key];

        // Helper function to format numbers (show decimals only if needed)
        const formatNumber = (num) => {
            return num % 1 === 0 ? num.toString() : num.toFixed(1);
        };

        // Helper function to format day/days text
        const formatDaysText = (num) => {
            const formatted = formatNumber(num);
            const absNum = Math.abs(num);

            // Special handling for short leave - show as "X total" instead of "X day/days"
            if (type.key === 'shortLeave') {
                return `${formatted} total`;
            }

            return absNum === 1 ? `${formatted} day` : `${formatted} days`;
        };

        // Handle negative balances first
        if (remaining < 0) {
            return {
                mainNumber: formatDaysText(remaining),
                mainLabel: 'Balance',
                sub: `${formatDaysText(Math.abs(remaining))} overdrawn`,
                showProgress: false,
                status: 'negative',
                shouldDisplay: true
            };
        }

        // Skip leave types with no remaining balance and no manual allocation
        if ((remaining === 0 || remaining === undefined) && (allocation === undefined || allocation === 0)) {
            return null; // Don't display this leave type
        }

        // For accrual types or when no manual allocation is provided, show remaining with no progress
        if (allocation === undefined || allocation === 0) {
            const isAccruingType = (type.key === 'leave in-lieu' || type.key === 'other');
            return {
                mainNumber: formatDaysText(remaining),
                mainLabel: 'Taken',
                sub: isAccruingType ? 'Accrued only' : '',
                showProgress: false,
                shouldDisplay: remaining > 0
            };
        }

        // Use the manually configured allocation as the total
        const total = typeof allocation === 'number' ? allocation : 0;
        const used = Math.max(0, total - remaining);
        const percentageUsed = total > 0 ? (used / total) * 100 : 0;

        // Special handling for short leave - show as count, not days
        if (type.key === 'shortLeave') {
            return {
                mainNumber: formatNumber(remaining),
                mainLabel: 'Remaining',
                sub: `${formatNumber(total)} leave total`,
                showProgress: true,
                percentage: percentageUsed,
                status: remaining <= 0 ? 'low' : 'good',
                shouldDisplay: true
            };
        }

        return {
            mainNumber: formatDaysText(remaining),
            mainLabel: 'Remaining',
            sub: `${formatDaysText(total)} total`,
            showProgress: true,
            percentage: percentageUsed,
            status: remaining <= 2 && remaining > 0 ? 'low' : 'good',
            shouldDisplay: true
        };
    };

    const getProgressColor = (status) => {
        switch(status) {
            case 'low': return 'bg-yellow-500';
            case 'negative': return 'bg-red-500';
            default: return 'bg-green-500';
        }
    };

    // Desired display order:
    // Annual, Casual, Sick, Leave in-lieu, Other, Maternity/Paternity (gender-filtered)
    const ORDER = ['annualLeave', 'casualLeave', 'sickLeave', 'leave in-lieu', 'other', 'maternityLeave', 'paternityLeave'];

    // Filter out leave types that shouldn't be displayed, then sort to desired order
    const displayableLeaveTypes = filteredLeaveTypes
        .map(type => ({ ...type, balance: formatLeaveBalance(type) }))
        .filter(type => type.balance && type.balance.shouldDisplay)
        .sort((a, b) => {
            const ai = ORDER.indexOf(a.key);
            const bi = ORDER.indexOf(b.key);
            return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
        });

    return (
        <div className="bg-card p-6 rounded-lg shadow-sm">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold text-slate-200">My Leave Balance</h2>
                {isOnNoPay && (
                    <div className="bg-red-900/30 text-red-300 px-3 py-1 rounded-full text-sm font-medium border border-red-500/30">
                        ⚠️ No Pay Status
                    </div>
                )}
            </div>
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
                            {balance.status === 'negative' && (
                                <div className="absolute top-3 right-3">
                                    <span className="text-xs bg-red-500/20 text-red-300 px-2 py-1 rounded-full">
                                        Negative
                                    </span>
                                </div>
                            )}
                            
                            {/* Leave Type Name */}
                            <div className="text-center mb-6">
                                <p className={`text-base font-semibold ${type.textColor}`}>{type.label}</p>
                            </div>
                            
                            {/* Remaining Days - Large Display */}
                            <div className="text-center mb-4">
                                <p className={`text-2xl font-bold ${balance.status === 'negative' ? 'text-red-400' : type.titleColor}`}>
                                    {balance.mainNumber}
                                </p>
                                <p className={`text-sm ${type.textColor} opacity-90 font-medium`}>
                                    {balance.mainLabel}
                                </p>
                            </div>
                            
                            {/* Total Days - Smaller Display */}
                            <div className="text-center">
                                <p className={`text-sm ${balance.status === 'negative' ? 'text-red-300' : type.textColor} opacity-90 font-medium`}>
                                    {balance.sub}
                                </p>
                            </div>
                            
                            {/* Reserve progress bar space for alignment; hide bar when not applicable */}
                            <div className="mt-4">
                                <div className="w-full bg-gray-700 rounded-full h-2.5">
                                    <div
                                        className={`h-2.5 rounded-full ${balance.showProgress ? getProgressColor(balance.status) : ''} transition-all duration-300 ${balance.showProgress ? '' : 'opacity-0'}`}
                                        style={{ width: balance.showProgress ? `${Math.min(100, balance.percentage)}%` : '100%' }}
                                    ></div>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
