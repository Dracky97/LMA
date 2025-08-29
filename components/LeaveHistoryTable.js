import React from 'react';

const getStatusBadge = (status) => {
    const statuses = {
        'Approved': 'bg-green-900/30 text-green-300',
        'Rejected': 'bg-red-900/30 text-red-300',
        'Pending HR Approval': 'bg-blue-900/30 text-blue-300',
        'Pending Department Approval': 'bg-yellow-900/30 text-yellow-300',
    };
    const color = statuses[status] || 'bg-slate-700 text-slate-300';
    return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${color}`}>{status}</span>;
};

export default function LeaveHistoryTable({ requests, users = {}, isAdminView = false }) {
    if (!requests || requests.length === 0) {
        return <p className="text-center text-slate-500 py-8">No leave requests found.</p>;
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
                        {isAdminView && <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Employee</th>}
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Type</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Dates</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Reason</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Status</th>
                    </tr>
                </thead>
                <tbody className="bg-card divide-y divide-gray-700">
                    {requests.map(req => (
                        <tr key={req.id}>
                            {isAdminView && <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-200">{users[req.userId]?.name || req.userName || 'Unknown User'}</td>}
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400">{req.type}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400">{formatDate(req.startDate)} - {formatDate(req.endDate)}</td>
                            <td className="px-6 py-4 text-sm text-slate-400 max-w-xs truncate">{req.reason}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400">{getStatusBadge(req.status)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};
