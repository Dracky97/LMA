import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '../context/AuthContext';

export default function DashboardLayout({ children }) {
    const { userData, logout } = useAuth();
    const router = useRouter();

    const navLinks = [
        { name: 'Leave', href: '/dashboard' },
        { name: 'Attendance', href: '/attendance' },
        { name: 'My Profile', href: `/profile/${userData?.uid}` },
    ];

    // Conditionally add the Team Requests link if the user is a manager
    if (userData?.isManager) {
        navLinks.splice(1, 0, { name: 'Team Requests', href: '/team-requests' });
    }

    return (
        <div className="min-h-screen bg-background">
            <header className="bg-card shadow-sm sticky top-0 z-40">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-200">HR Portal</h1>
                        {userData && <p className="text-sm text-slate-400">Welcome, {userData.name}</p>}
                    </div>
                    <div className="flex items-center">
                        <button onClick={logout} className="flex items-center space-x-2 text-sm font-medium text-slate-300 hover:text-indigo-400">
                            {/* Logout Icon SVG */}
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
                            <span>Logout</span>
                        </button>
                    </div>
                </div>
                <nav className="bg-card border-t border-gray-700">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                        <div className="flex space-x-8">
                            {navLinks.map((link) => (
                                <Link key={link.name} href={link.href} legacyBehavior>
                                    <a className={`py-3 px-1 border-b-2 text-sm font-medium ${
                                        router.pathname === link.href
                                            ? 'border-indigo-500 text-indigo-400'
                                            : 'border-transparent text-slate-400 hover:border-slate-300 hover:text-slate-300'
                                    }`}>
                                        {link.name}
                                    </a>
                                </Link>
                            ))}
                        </div>
                    </div>
                </nav>
            </header>
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {children}
            </main>
        </div>
    );
}