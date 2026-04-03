import React, { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useRouter } from 'next/router';
import DashboardLayout from '../components/DashboardLayout';
import CalendarView from '../components/CalendarView';

export default function CalendarPage() {
    const { userData, loading } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (!loading && !userData) router.push('/');
    }, [userData, loading, router]);

    if (loading || !userData) {
        return (
            <DashboardLayout>
                <div className="text-slate-400 text-center py-12">Loading...</div>
            </DashboardLayout>
        );
    }

    return (
        <DashboardLayout>
            <CalendarView />
        </DashboardLayout>
    );
}
