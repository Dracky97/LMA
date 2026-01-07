import React from 'react';
import { calculateLeaveEntitlements, formatLeaveEntitlements, getQuarterInfo } from '../lib/leavePolicy';

/**
 * Component to display leave policy information and calculations
 * @param {Object} employee - Employee object with joinDate
 * @param {number} year - Year to calculate for (defaults to current year)
 * @returns {JSX.Element} Leave policy info component
 */
export default function LeavePolicyInfo({ employee, year = new Date().getFullYear() }) {
    if (!employee || !employee.joinDate) {
        return (
            <div className="bg-gray-900/30 border border-gray-600 rounded-lg p-4">
                <h4 className="text-sm font-medium text-slate-300 mb-2">Leave Policy Information</h4>
                <p className="text-xs text-slate-400">No join date available for policy calculation</p>
            </div>
        );
    }

    try {
        // Handle different date formats (Firestore timestamp, string, Date object)
        let joinDate;
        if (employee.joinDate instanceof Date) {
            joinDate = employee.joinDate;
        } else if (employee.joinDate && typeof employee.joinDate === 'object' && employee.joinDate.toDate) {
            // Firestore Timestamp
            joinDate = employee.joinDate.toDate();
        } else if (typeof employee.joinDate === 'string') {
            joinDate = new Date(employee.joinDate);
        } else {
            throw new Error('Invalid join date format');
        }
        
        // Validate date
        if (isNaN(joinDate.getTime())) {
            throw new Error('Invalid join date: ' + employee.joinDate);
        }
        
        const entitlements = calculateLeaveEntitlements(joinDate, year);
        const formattedEntitlements = formatLeaveEntitlements(entitlements);
        const quarterInfo = entitlements.condition === 'B' ? getQuarterInfo(joinDate) : null;

        return (
            <div className="bg-gray-900/30 border border-gray-600 rounded-lg p-4 space-y-4">
                <h4 className="text-sm font-medium text-slate-300 mb-3">Leave Policy Information</h4>
                
                {/* Employee Status */}
                <div className="space-y-2">
                    <div className="flex justify-between items-center">
                        <span className="text-xs text-slate-400">Employee Status:</span>
                        <span className="text-xs font-medium text-slate-200">{formattedEntitlements.condition}</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-xs text-slate-400">Join Date:</span>
                        <span className="text-xs text-slate-200">{new Date(employee.joinDate).toLocaleDateString()}</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-xs text-slate-400">Service Period:</span>
                        <span className="text-xs text-slate-200">{formattedEntitlements.completedMonths}</span>
                    </div>
                </div>

                {/* Current Year Entitlements */}
                <div className="border-t border-gray-700 pt-3">
                    <h5 className="text-xs font-medium text-slate-300 mb-2">{year} Entitlements:</h5>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="flex justify-between">
                            <span className="text-slate-400">Annual Leave:</span>
                            <span className="text-slate-200 font-medium">{formattedEntitlements.annualLeave}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-slate-400">Sick Leave:</span>
                            <span className="text-slate-200 font-medium">{formattedEntitlements.sickLeave}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-slate-400">Casual Leave:</span>
                            <span className="text-slate-200 font-medium">{formattedEntitlements.casualLeave}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-slate-400">Short Leave:</span>
                            <span className="text-slate-200 font-medium">1 hour/month</span>
                        </div>
                    </div>
                </div>

                {/* Special calculation info for Condition B */}
                {quarterInfo && (
                    <div className="border-t border-gray-700 pt-3">
                        <h5 className="text-xs font-medium text-slate-300 mb-2">Previous Year Joiner Details:</h5>
                        <div className="space-y-1 text-xs">
                            <div className="flex justify-between">
                                <span className="text-slate-400">Join Quarter:</span>
                                <span className="text-slate-200">{quarterInfo.quarterName}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-400">Annual Leave:</span>
                                <span className="text-slate-200">{quarterInfo.annualLeave} days</span>
                            </div>
                        </div>
                    </div>
                )}

                {/* Policy Note */}
                <div className="border-t border-gray-700 pt-3">
                    <div className="text-xs text-slate-400 italic">
                        {formattedEntitlements.note}
                    </div>
                </div>

                {/* Short Leave Policy */}
                <div className="border-t border-gray-700 pt-3">
                    <h5 className="text-xs font-medium text-slate-300 mb-2">Short Leave Policy:</h5>
                    <div className="space-y-1 text-xs text-slate-400">
                        <div>• 3 hours allowance per month</div>
                        <div>• Maximum 2 hours per single request</div>
                        <div>• Cannot apply for 3+ hours in one go</div>
                    </div>
                </div>
            </div>
        );
    } catch (error) {
        return (
            <div className="bg-red-900/30 border border-red-600/50 rounded-lg p-4">
                <h4 className="text-sm font-medium text-red-300 mb-2">Leave Policy Error</h4>
                <p className="text-xs text-red-400">{error.message}</p>
            </div>
        );
    }
}

/**
 * Component to show quick policy reference
 * @returns {JSX.Element} Policy reference component
 */
export function LeavePolicyReference() {
    return (
        <div className="bg-blue-900/30 border border-blue-600/50 rounded-lg p-4">
            <h4 className="text-sm font-medium text-blue-300 mb-3">Leave Policy Reference</h4>
            
            <div className="space-y-3">
                {/* Condition A */}
                <div>
                    <h5 className="text-xs font-medium text-blue-200 mb-1">Condition A: Current Year Joiner</h5>
                    <div className="text-xs text-blue-100 space-y-1">
                        <div>• Annual Leave: 0 days</div>
                        <div>• Sick Leave: 7 days</div>
                        <div>• Casual Leave: 0.5 × completed months</div>
                    </div>
                </div>

                {/* Condition B */}
                <div>
                    <h5 className="text-xs font-medium text-blue-200 mb-1">Condition B: Previous Year Joiner</h5>
                    <div className="text-xs text-blue-100 space-y-1">
                        <div>• Sick Leave: 7 days</div>
                        <div>• Casual Leave: 7 days</div>
                        <div>• Annual Leave: Based on join quarter</div>
                        <div className="ml-2 mt-1 space-y-0.5">
                            <div>Q1 (Jan-Mar): 14 days</div>
                            <div>Q2 (Apr-Jun): 10 days</div>
                            <div>Q3 (Jul-Sep): 7 days</div>
                            <div>Q4 (Oct-Dec): 4 days</div>
                        </div>
                    </div>
                </div>

                {/* Condition C */}
                <div>
                    <h5 className="text-xs font-medium text-blue-200 mb-1">Condition C: Long-term Employee</h5>
                    <div className="text-xs text-blue-100 space-y-1">
                        <div>• Annual Leave: 14 days</div>
                        <div>• Sick Leave: 7 days</div>
                        <div>• Casual Leave: 7 days</div>
                    </div>
                </div>

                {/* Short Leave Policy */}
                <div>
                    <h5 className="text-xs font-medium text-blue-200 mb-1">Short Leave Policy (Global)</h5>
                    <div className="text-xs text-blue-100 space-y-1">
                        <div>• 3 hours per month allowance</div>
                        <div>• Maximum 2 hours per request</div>
                        <div>• Cannot exceed 2 hours in single request</div>
                    </div>
                </div>
            </div>
        </div>
    );
}