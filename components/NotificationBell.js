import React, { useState, useEffect, useRef } from 'react';
import { getFirestore, collection, query, where, onSnapshot, updateDoc, doc } from 'firebase/firestore';
import { app } from '../lib/firebase-client';
import { useAuth } from '../context/AuthContext';

const db = getFirestore(app);

function formatTime(createdAt) {
    if (!createdAt) return '';
    const date = createdAt.toDate ? createdAt.toDate() : new Date(createdAt);
    const diff = Date.now() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
}

function typeStyle(type) {
    switch (type) {
        case 'leave_approved':  return 'border-l-2 border-green-500 bg-green-900/20';
        case 'leave_rejected':  return 'border-l-2 border-red-500 bg-red-900/20';
        case 'leave_submitted': return 'border-l-2 border-blue-500 bg-blue-900/20';
        case 'leave_escalated': return 'border-l-2 border-yellow-500 bg-yellow-900/20';
        default:                return 'border-l-2 border-gray-500 bg-gray-800/20';
    }
}

export default function NotificationBell() {
    const { userData } = useAuth();
    const [notifications, setNotifications] = useState([]);
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        if (!userData?.uid) return;
        const q = query(
            collection(db, 'notifications'),
            where('recipientId', '==', userData.uid)
        );
        const unsub = onSnapshot(q, (snap) => {
            const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            items.sort((a, b) => {
                const aTime = a.createdAt?.toDate?.()?.getTime() ?? 0;
                const bTime = b.createdAt?.toDate?.()?.getTime() ?? 0;
                return bTime - aTime;
            });
            setNotifications(items.slice(0, 25));
        });
        return () => unsub();
    }, [userData?.uid]);

    useEffect(() => {
        const handleOutside = (e) => {
            if (ref.current && !ref.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener('mousedown', handleOutside);
        return () => document.removeEventListener('mousedown', handleOutside);
    }, []);

    const unread = notifications.filter(n => !n.read);

    const markAllRead = async () => {
        await Promise.all(unread.map(n => updateDoc(doc(db, 'notifications', n.id), { read: true })));
    };

    const handleToggle = () => {
        if (!open && unread.length > 0) markAllRead();
        setOpen(v => !v);
    };

    return (
        <div className="relative" ref={ref}>
            <button
                onClick={handleToggle}
                className="relative p-2 text-slate-300 hover:text-white focus:outline-none"
                aria-label="Notifications"
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                {unread.length > 0 && (
                    <span className="absolute top-0.5 right-0.5 bg-red-500 text-white text-xs rounded-full h-4 w-4 flex items-center justify-center font-bold leading-none">
                        {unread.length > 9 ? '9+' : unread.length}
                    </span>
                )}
            </button>

            {open && (
                <div className="absolute right-0 mt-2 w-80 bg-[#1e1e2e] border border-gray-700 rounded-lg shadow-2xl z-50">
                    <div className="px-4 py-3 border-b border-gray-700 flex justify-between items-center">
                        <span className="text-sm font-semibold text-slate-200">Notifications</span>
                        {unread.length > 0 && (
                            <button onClick={markAllRead} className="text-xs text-[#c6a876] hover:text-[#d4b888]">
                                Mark all read
                            </button>
                        )}
                    </div>

                    <div className="max-h-80 overflow-y-auto divide-y divide-gray-700/50">
                        {notifications.length === 0 ? (
                            <p className="px-4 py-6 text-center text-sm text-slate-400">No notifications yet</p>
                        ) : notifications.map(n => (
                            <div key={n.id} className={`px-3 py-3 m-2 rounded ${typeStyle(n.type)} ${n.read ? 'opacity-55' : ''}`}>
                                <div className="flex justify-between items-start gap-2">
                                    <p className="text-sm font-medium text-slate-200 leading-tight">{n.title}</p>
                                    <span className="text-xs text-slate-500 shrink-0">{formatTime(n.createdAt)}</span>
                                </div>
                                <p className="text-xs text-slate-300 mt-1 leading-relaxed">{n.message}</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
