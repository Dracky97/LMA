import React from 'react';

export default function LeaveBalanceCard({ balances }) {
    if (!balances) {
        return null;
    }

    return (
        <div className="bg-card p-6 rounded-lg shadow-sm">
            <h2 className="text-xl font-semibold text-slate-200 mb-4">My Leave Balance</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
                <div className="bg-blue-900/30 p-4 rounded-lg">
                    <p className="text-sm text-blue-300 font-medium">Annual</p>
                    <p className="text-3xl font-bold text-blue-200">{balances.annual || 0}</p>
                </div>
                <div className="bg-green-900/30 p-4 rounded-lg">
                    <p className="text-sm text-green-300 font-medium">Sick</p>
                    <p className="text-3xl font-bold text-green-200">{balances.sick || 0}</p>
                </div>
                <div className="bg-yellow-900/30 p-4 rounded-lg">
                    <p className="text-sm text-yellow-300 font-medium">Casual</p>
                    <p className="text-3xl font-bold text-yellow-200">{balances.casual || 0}</p>
                </div>
            </div>
        </div>
    );
}
