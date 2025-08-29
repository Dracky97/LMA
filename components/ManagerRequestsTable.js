import React from 'react';

export default function ManagerRequestsTable({ requests, users, onUpdate }) {
    if (!requests || requests.length === 0) {
        return <p className="text-center text-slate-500 py-8">No pending requests to review.</p>;
    }

    const formatDate = (timestamp) => {
        if (!timestamp || !timestamp.toDate) return 'N/A';
        return timestamp.toDate().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    };

    return (
        <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-700">
                <thead className="bg-muted">
                    <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Employee</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Type</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Dates</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Reason</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Actions</th>
                    </tr>
                </thead>
                <tbody className="bg-card divide-y divide-gray-700">
                    {requests.map(req => (
                        <tr key={req.id}>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-200">{users[req.userId]?.name || req.userName || 'Unknown'}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400">{req.type}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400">{formatDate(req.startDate)} - {formatDate(req.endDate)}</td>
                            <td className="px-6 py-4 text-sm text-slate-400 max-w-xs truncate" title={req.reason}>{req.reason}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                                <button onClick={() => onUpdate(req.id, 'Approved')} className="text-green-400 hover:text-green-300 transition-colors">Approve</button>
                                <button onClick={() => onUpdate(req.id, 'Rejected')} className="text-red-400 hover:text-red-300 transition-colors">Reject</button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};
