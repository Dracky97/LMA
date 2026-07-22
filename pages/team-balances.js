import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { collection, getFirestore, onSnapshot, query, where } from 'firebase/firestore';
import DashboardLayout from '../components/DashboardLayout';
import { useAuth } from '../context/AuthContext';
import { app } from '../lib/firebase-client';
import { getFilteredLeaveBalanceTypes } from '../lib/leaveTypes';

const db = getFirestore(app);

const formatBalance = (value) => {
    const balance = Number(value ?? 0);
    return Number.isInteger(balance) ? balance : balance.toFixed(1);
};

export default function TeamBalancesPage() {
    const { userData, loading: authLoading } = useAuth();
    const router = useRouter();
    const [teamMembers, setTeamMembers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');

    useEffect(() => {
        if (authLoading) return;
        if (!userData) {
            router.replace('/');
            return;
        }
        if (!userData.isManager) {
            router.replace('/dashboard');
            return;
        }

        const teamQuery = query(
            collection(db, 'users'),
            where('managerId', '==', userData.uid)
        );

        return onSnapshot(teamQuery, (snapshot) => {
            const members = snapshot.docs
                .map(member => ({ id: member.id, ...member.data() }))
                .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            setTeamMembers(members);
            setError('');
            setLoading(false);
        }, (snapshotError) => {
            console.error('Error fetching team leave balances:', snapshotError);
            setError('Unable to load team leave balances. Please try again.');
            setLoading(false);
        });
    }, [authLoading, userData, router]);

    const filteredMembers = useMemo(() => {
        const term = search.trim().toLowerCase();
        if (!term) return teamMembers;
        return teamMembers.filter(member =>
            [member.name, member.employeeNumber, member.department, member.designation]
                .some(value => String(value || '').toLowerCase().includes(term))
        );
    }, [search, teamMembers]);

    return (
        <DashboardLayout>
            <section className="bg-card p-4 sm:p-6 rounded-lg shadow-sm">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-6">
                    <div>
                        <h1 className="text-xl font-semibold text-slate-200">Team Leave Balances</h1>
                        <p className="text-sm text-slate-400 mt-1">Current balances for your direct team members.</p>
                    </div>
                    <label className="block sm:w-72">
                        <span className="sr-only">Search team members</span>
                        <input
                            type="search"
                            value={search}
                            onChange={event => setSearch(event.target.value)}
                            placeholder="Search team members"
                            className="w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-[#c6a876] focus:outline-none"
                        />
                    </label>
                </div>

                {loading || authLoading ? (
                    <p className="text-slate-400">Loading team balances...</p>
                ) : error ? (
                    <div className="rounded-md bg-red-900/30 p-3 text-red-300">{error}</div>
                ) : filteredMembers.length === 0 ? (
                    <p className="text-slate-400">
                        {teamMembers.length === 0 ? 'No team members are assigned to you.' : 'No team members match your search.'}
                    </p>
                ) : (
                    <div className="space-y-4">
                        {filteredMembers.map(member => (
                            <article key={member.id} className="rounded-lg border border-slate-700 p-4">
                                <div className="mb-4">
                                    <h2 className="font-semibold text-slate-200">{member.name || 'Unnamed employee'}</h2>
                                    <p className="text-sm text-slate-400">
                                        {[member.designation, member.department, member.employeeNumber].filter(Boolean).join(' · ') || 'Employee'}
                                    </p>
                                </div>
                                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                                    {getFilteredLeaveBalanceTypes(member.gender).map(type => {
                                        const balance = Number(member.leaveBalance?.[type.key] ?? 0);
                                        return (
                                            <div key={type.key} className={`${type.bgColor} rounded-md p-3`}>
                                                <div className={`text-xs ${type.titleColor}`}>{type.label}</div>
                                                <div className={`mt-1 text-lg font-semibold ${balance < 0 ? 'text-red-400' : type.textColor}`}>
                                                    {formatBalance(balance)} {type.key === 'shortLeave' ? 'hrs' : 'days'}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </article>
                        ))}
                    </div>
                )}
            </section>
        </DashboardLayout>
    );
}
