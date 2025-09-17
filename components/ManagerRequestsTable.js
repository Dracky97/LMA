import React, { useState } from 'react';

export default function ManagerRequestsTable({ requests, users, onUpdate }) {
    const [showRejectModal, setShowRejectModal] = useState(false);
    const [selectedRequest, setSelectedRequest] = useState(null);
    const [rejectionReason, setRejectionReason] = useState('');

    if (!requests || requests.length === 0) {
        return <p className="text-center text-slate-500 py-8">No pending requests to review.</p>;
    }

    const formatDate = (timestamp) => {
        if (!timestamp || !timestamp.toDate) return 'N/A';
        return timestamp.toDate().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    };

    const handleRejectClick = (request) => {
        setSelectedRequest(request);
        setRejectionReason('');
        setShowRejectModal(true);
    };

    const handleRejectConfirm = () => {
        onUpdate(selectedRequest.id, 'Rejected', rejectionReason);
        setShowRejectModal(false);
        setSelectedRequest(null);
        setRejectionReason('');
    };

    const handleRejectCancel = () => {
        setShowRejectModal(false);
        setSelectedRequest(null);
        setRejectionReason('');
    };

    return (
        <>
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
                                    <button onClick={() => onUpdate(req.id, 'Approved', '')} className="text-green-400 hover:text-green-300 transition-colors">Approve</button>
                                    <button onClick={() => handleRejectClick(req)} className="text-red-400 hover:text-red-300 transition-colors">Reject</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Rejection Reason Modal */}
            {showRejectModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4">
                    <div className="bg-card rounded-lg shadow-xl w-full max-w-md">
                        <div className="p-6">
                            <h3 className="text-lg font-medium text-slate-200 mb-4">Reject Leave Request</h3>
                            
                            <div className="mb-4">
                                <p className="text-sm text-slate-300 mb-2">
                                    Employee: <span className="font-semibold">{users[selectedRequest?.userId]?.name || selectedRequest?.userName}</span>
                                </p>
                                <p className="text-sm text-slate-300 mb-4">
                                    Leave Type: <span className="font-semibold">{selectedRequest?.type}</span>
                                </p>
                            </div>

                            <div className="mb-6">
                                <label className="block text-sm font-medium text-slate-300 mb-2">Rejection Reason (Optional)</label>
                                <textarea
                                    value={rejectionReason}
                                    onChange={(e) => setRejectionReason(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 text-slate-200 bg-card"
                                    rows="3"
                                    placeholder="Enter reason for rejection (optional)"
                                />
                            </div>
                            
                            <div className="flex justify-end space-x-3">
                                <button
                                    type="button"
                                    onClick={handleRejectCancel}
                                    className="px-4 py-2 text-sm font-medium text-slate-300 bg-card border border-gray-600 rounded-md hover:bg-muted focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={handleRejectConfirm}
                                    className="px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                                >
                                    Reject Request
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};
