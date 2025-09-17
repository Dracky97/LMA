import React, { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useRouter } from 'next/router';
import DashboardLayout from '../components/DashboardLayout';
import EmployeeDashboard from '../components/dashboards/EmployeeDashboard';
import DepartmentManagerDashboard from '../components/dashboards/DepartmentManagerDashboard';
import AdminDashboard from '../components/dashboards/AdminDashboard';
import HRManagerDashboard from '../components/dashboards/HRManagerDashboard';

export default function LeaveDashboardPage() {
    const { userData, loading } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (!loading && !userData) router.push('/');
    }, [userData, loading, router]);

    if (loading || !userData) {
        return (
            <DashboardLayout>
                <div>Loading...</div>
            </DashboardLayout>
        );
    }

    const renderDashboard = () => {
        switch (userData.role) {
            case 'Employee':
                return <EmployeeDashboard />;
            
            case 'Manager HR':
                return <HRManagerDashboard />;
            
            case 'CEO':
            case 'CMO':
            case 'CFO':
            case 'COO':
            case 'Head of Academic':
            case 'Head - Student Support': // <-- NEW ROLE ADDED
            case 'Manager IT':
            case 'Finance Manager':
            case 'Manager - Marketing & Student Enrolment':
            case 'Manager - Digital Marketing':
            case 'Sales Manager':
                return <DepartmentManagerDashboard />;

            case 'Admin':
                return <AdminDashboard />;
            
            default:
                return <div>Invalid User Role. Please contact an administrator.</div>;
        }
    };

    return <DashboardLayout>{renderDashboard()}</DashboardLayout>;
}
