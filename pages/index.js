import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../context/AuthContext';
import AuthPage from '../components/AuthPage';

export default function HomePage() {
    const { user, loading } = useAuth();
    const router = useRouter();
    const [view, setView] = useState('login');

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
            {view === 'login' ? (
                <AuthPage
                    title="Login to Your Account"
                    isSignup={false}
                    onSwitch={() => setView('signup')}
                />
            ) : (
                <AuthPage
                    title="Create a New Account"
                    isSignup={true}
                    onSwitch={() => setView('login')}
                />
            )}
        </div>
    );
}
