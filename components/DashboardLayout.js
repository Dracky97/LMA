import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '../context/AuthContext';
import NotificationBell from './NotificationBell';

export default function DashboardLayout({ children }) {
    const { userData, logout } = useAuth();
    const router = useRouter();
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    const navLinks = [
        { name: 'Leave', href: '/dashboard' },
        { name: 'Attendance', href: '/attendance' },
        { name: 'Calendar', href: '/calendar' },
        { name: 'My Profile', href: userData?.uid ? `/profile/${userData.uid}` : '#' },
    ];

    if (userData?.isManager) {
        navLinks.splice(1, 0, { name: 'Team Requests', href: '/team-requests' });
        navLinks.splice(2, 0, { name: 'Team Balances', href: '/team-balances' });
    }

    return (
        <div className="min-h-screen bg-background">
            {/* Top Header */}
            <header className="sticky top-0 z-40 shadow-lg" style={{ background: 'linear-gradient(135deg, #2d1554 0%, #411e75 100%)' }}>
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex justify-between items-center">
                    <div className="min-w-0">
                        <h1 className="text-xl sm:text-2xl font-bold text-white leading-tight">HR Portal</h1>
                        {userData && (
                            <p className="text-xs sm:text-sm text-slate-300 truncate">Welcome, {userData.name}</p>
                        )}
                    </div>

                    {/* Desktop right actions */}
                    <div className="hidden sm:flex items-center space-x-3">
                        <NotificationBell />
                        <button
                            onClick={logout}
                            className="flex items-center space-x-2 text-sm font-medium text-slate-300 hover:text-[#c6a876]"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                                <polyline points="16 17 21 12 16 7"></polyline>
                                <line x1="21" y1="12" x2="9" y2="12"></line>
                            </svg>
                            <span>Logout</span>
                        </button>
                    </div>

                    {/* Mobile right actions */}
                    <div className="flex sm:hidden items-center space-x-2">
                        <NotificationBell />
                        {/* Hamburger */}
                        <button
                            onClick={() => setMobileMenuOpen(v => !v)}
                            className="p-2 text-slate-300 hover:text-white focus:outline-none"
                            aria-label="Open menu"
                        >
                            {mobileMenuOpen ? (
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            ) : (
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                                </svg>
                            )}
                        </button>
                    </div>
                </div>

                {/* Desktop nav */}
                <nav className="hidden sm:block bg-card border-t border-white/10">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                        <div className="flex space-x-6 overflow-x-auto">
                            {navLinks.map((link) => (
                                <Link key={link.name} href={link.href} legacyBehavior>
                                    <a className={`whitespace-nowrap py-3 px-1 border-b-2 text-sm font-medium ${
                                        router.pathname === link.href
                                            ? 'border-[#c6a876] text-white'
                                            : 'border-transparent text-[#c6a876] hover:border-slate-300 hover:text-white'
                                    }`}>
                                        {link.name}
                                    </a>
                                </Link>
                            ))}
                        </div>
                    </div>
                </nav>

                {/* Mobile nav drawer */}
                {mobileMenuOpen && (
                    <nav className="sm:hidden bg-card border-t border-white/10">
                        <div className="px-4 py-2 space-y-1">
                            {navLinks.map((link) => (
                                <Link key={link.name} href={link.href} legacyBehavior>
                                    <a
                                        onClick={() => setMobileMenuOpen(false)}
                                        className={`block px-3 py-2 rounded-md text-sm font-medium ${
                                            router.pathname === link.href
                                                ? 'bg-purple-900/50 text-white'
                                                : 'text-[#c6a876] hover:bg-gray-700 hover:text-white'
                                        }`}
                                    >
                                        {link.name}
                                    </a>
                                </Link>
                            ))}
                            <button
                                onClick={() => { setMobileMenuOpen(false); logout(); }}
                                className="w-full text-left flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium text-slate-300 hover:bg-gray-700 hover:text-white"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                                    <polyline points="16 17 21 12 16 7"></polyline>
                                    <line x1="21" y1="12" x2="9" y2="12"></line>
                                </svg>
                                <span>Logout</span>
                            </button>
                        </div>
                    </nav>
                )}
            </header>

            <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8">
                {children}
            </main>
        </div>
    );
}
