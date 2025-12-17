import React, { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../context/AuthContext';
import AuthPage from '../components/AuthPage';

export default function HomePage() {
    const { user, loading } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (!loading && user) {
            router.push('/dashboard');
        }
    }, [user, loading, router]);

    if (loading || (!loading && user)) {
        return <div className="flex items-center justify-center h-screen bg-background"><div className="text-xl font-semibold text-slate-300">Loading...</div></div>;
    }

    return (
        <div className="min-h-screen bg-background flex flex-col justify-center items-center p-4">
            <AuthPage
                title="Login to Your Account"
                isSignup={false}
            />
        </div>
    );
}
