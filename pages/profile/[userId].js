import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import DashboardLayout from '../../components/DashboardLayout';
import { useAuth } from '../../context/AuthContext';
import { getFirestore, doc, getDoc, updateDoc } from 'firebase/firestore';
import { app } from '../../lib/firebase-client';

const db = getFirestore(app);

export default function ProfilePage() {
    const router = useRouter();
    const { userId } = router.query;
    const { userData: currentUserData } = useAuth();
    const [profileData, setProfileData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isEditingEvaluation, setIsEditingEvaluation] = useState(false);
    const [newEvaluationDate, setNewEvaluationDate] = useState('');
    const [message, setMessage] = useState(null);

    useEffect(() => {
        if (!userId) return;

        const fetchProfile = async () => {
            const userDocRef = doc(db, 'users', userId);
            try {
                const docSnap = await getDoc(userDocRef);
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    setProfileData(data);
                    setNewEvaluationDate(data.nextEvaluationDate ? new Date(data.nextEvaluationDate).toISOString().split('T')[0] : '');
                }
            } catch (error) {
                console.error("Error fetching profile:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchProfile();
    }, [userId]);

    const handleEditEvaluation = () => {
        setIsEditingEvaluation(true);
        setNewEvaluationDate(profileData.nextEvaluationDate ? new Date(profileData.nextEvaluationDate).toISOString().split('T')[0] : '');
    };

    const handleCancelEdit = () => {
        setIsEditingEvaluation(false);
        setNewEvaluationDate(profileData.nextEvaluationDate ? new Date(profileData.nextEvaluationDate).toISOString().split('T')[0] : '');
    };

    const handleSaveEvaluation = async () => {
        try {
            setMessage(null);
            const userDocRef = doc(db, 'users', userId);
            await updateDoc(userDocRef, {
                nextEvaluationDate: newEvaluationDate ? new Date(newEvaluationDate).toISOString() : null
            });

            setProfileData({ ...profileData, nextEvaluationDate: newEvaluationDate ? new Date(newEvaluationDate).toISOString() : null });
            setIsEditingEvaluation(false);
            setMessage({ type: 'success', text: 'Evaluation date updated successfully.' });
        } catch (error) {
            console.error("Error updating evaluation date:", error);
            setMessage({ type: 'error', text: `Error updating evaluation date: ${error.message}` });
        }
    };

    if (loading) return <DashboardLayout><div>Loading profile...</div></DashboardLayout>;
    if (!profileData) return <DashboardLayout><div>User not found.</div></DashboardLayout>;

    const canEdit = currentUserData?.uid === userId || currentUserData?.role === 'Admin';
    const canEditEvaluation = currentUserData?.role === 'Admin' || currentUserData?.role === 'Manager HR' || currentUserData?.role === 'HR Manager';

    // Debug logging for role checking
    console.log('Current user role:', currentUserData?.role);
    console.log('Can edit evaluation:', canEditEvaluation);

    return (
        <DashboardLayout>
            {/* Profile Header with Cover Photo */}
            <div className="relative rounded-t-lg h-48">
                {/* Cover Photo */}
                {profileData.coverImageUrl ? (
                    <img
                        src={profileData.coverImageUrl}
                        alt="Cover"
                        className="w-full h-full object-cover rounded-t-lg"
                    />
                ) : (
                    <div className="bg-gradient-to-r from-blue-900 to-indigo-800 w-full h-full rounded-t-lg"></div>
                )}
                
                {/* Profile Picture */}
                <div className="absolute -bottom-16 left-8">
                    {profileData.profileImageUrl ? (
                        <img
                            src={profileData.profileImageUrl}
                            alt="Profile"
                            className="border-4 border-card rounded-full w-32 h-32 object-cover"
                        />
                    ) : (
                        <div className="bg-gray-200 border-4 border-card rounded-full w-32 h-32 flex items-center justify-center">
                            <span className="text-4xl font-bold text-gray-600">
                                {profileData.name?.charAt(0) || 'U'}
                            </span>
                        </div>
                    )}
                </div>
            </div>

            {/* Profile Content */}
            <div className="bg-card rounded-b-lg shadow-sm pb-8">
                {/* Profile Info */}
                <div className="pt-20 px-8">
                    <div className="flex justify-between items-start">
                        <div>
                            <h1 className="text-3xl font-bold text-slate-200">{profileData.name}</h1>
                            <p className="text-lg text-slate-400 mt-1">
                                {profileData.designation ? `${profileData.designation} - ` : ''}{profileData.department}
                            </p>
                            <p className="text-slate-500 mt-2">{profileData.personalDetails?.address || 'Location not specified'}</p>
                            {/* Current user role indicator for debugging */}
                            <p className="text-xs text-slate-600 mt-1">
                                Your role: {currentUserData?.role || 'Not set'} {canEditEvaluation ? '(Can edit evaluations)' : '(Cannot edit evaluations)'}
                            </p>
                        </div>
                        {canEdit && (
                            <button
                                onClick={() => router.push(`/profile/edit`)}
                                className="bg-blue-600 text-white px-6 py-2 rounded-full text-sm font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition duration-150 ease-in-out"
                            >
                                Edit Profile
                            </button>
                        )}
                    </div>
                </div>

                {/* Main Content Grid */}
                <div className="mt-8 px-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Left Column - Contact Info and Social */}
                    <div className="lg:col-span-1 space-y-6">
                        <div className="bg-muted p-6 rounded-lg">
                            <h3 className="text-lg font-semibold text-slate-200 mb-4">Contact Information</h3>
                            <div className="space-y-3">
                                <div>
                                    <p className="text-sm text-slate-400">Email</p>
                                    <p className="text-slate-200">{profileData.email}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-slate-400">Phone</p>
                                    <p className="text-slate-200">{profileData.personalDetails?.phone || 'Not provided'}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-slate-400">Employee Number</p>
                                    <p className="text-slate-200">{profileData.employeeNumber || 'Not provided'}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-slate-400">Employee Status</p>
                                    <p className="text-slate-200 capitalize">{profileData.employeeStatus || 'Not set'}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-slate-400">Joined Date</p>
                                    <p className="text-slate-200">{profileData.joinedDate ? new Date(profileData.joinedDate).toLocaleDateString() : 'Not set'}</p>
                                </div>
                                {profileData.designation && (
                                    <div>
                                        <p className="text-sm text-slate-400">Designation</p>
                                        <p className="text-slate-200">{profileData.designation}</p>
                                    </div>
                                )}
                                {profileData.personalDetails?.dob && (
                                    <div>
                                        <p className="text-sm text-slate-400">Date of Birth</p>
                                        <p className="text-slate-200">{new Date(profileData.personalDetails.dob).toLocaleDateString()}</p>
                                    </div>
                                )}
                                <div>
                                    <p className="text-sm text-slate-400">Address</p>
                                    <p className="text-slate-200">{profileData.personalDetails?.address || 'Not provided'}</p>
                                </div>
                            </div>
                        </div>

                        <div className="bg-muted p-6 rounded-lg">
                            <h3 className="text-lg font-semibold text-slate-200 mb-4">Social Media</h3>
                            <div className="space-y-3">
                                <div>
                                    <p className="text-sm text-slate-400">LinkedIn</p>
                                    <p className="text-slate-200">{profileData.socialMedia?.linkedin || 'Not provided'}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-slate-400">Twitter</p>
                                    <p className="text-slate-200">{profileData.socialMedia?.twitter || 'Not provided'}</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Right Column - Education and Qualifications */}
                    <div className="lg:col-span-2 space-y-6">
                        {/* Performance Evaluation Section */}
                        <div className="bg-muted p-6 rounded-lg">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-lg font-semibold text-slate-200">Performance Evaluation</h3>
                                {canEditEvaluation && !isEditingEvaluation && (
                                    <button
                                        onClick={handleEditEvaluation}
                                        className="bg-blue-600 text-white px-3 py-1 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 text-sm"
                                    >
                                        Edit Dates
                                    </button>
                                )}
                            </div>

                            {message && (
                                <div className={`p-3 rounded-md mb-4 ${message.type === 'success' ? 'bg-green-900/30 text-green-300' : 'bg-red-900/30 text-red-300'}`}>
                                    {message.text}
                                </div>
                            )}

                            <div className="space-y-3">
                                {/* Last Evaluation Field */}
                                <div>
                                    <p className="text-sm text-slate-400">Last Evaluation</p>
                                    <p className="text-slate-200">
                                        {profileData.lastEvaluationDate
                                            ? new Date(profileData.lastEvaluationDate).toLocaleDateString()
                                            : 'Not set'
                                        }
                                    </p>
                                </div>

                                {/* Next Evaluation Date */}
                                <div>
                                    <p className="text-sm text-slate-400">Next Evaluation</p>
                                    {isEditingEvaluation ? (
                                        <div className="flex items-center space-x-2 mt-1">
                                            <input
                                                type="date"
                                                value={newEvaluationDate}
                                                onChange={(e) => setNewEvaluationDate(e.target.value)}
                                                className="bg-card text-slate-200 border border-gray-600 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                                            />
                                            <button
                                                onClick={handleSaveEvaluation}
                                                className="bg-green-600 text-white px-2 py-1 rounded text-sm hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500"
                                            >
                                                Save
                                            </button>
                                            <button
                                                onClick={handleCancelEdit}
                                                className="bg-gray-600 text-white px-2 py-1 rounded text-sm hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500"
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="flex items-center justify-between">
                                            <p className="text-slate-200">
                                                {profileData.nextEvaluationDate
                                                    ? new Date(profileData.nextEvaluationDate).toLocaleDateString()
                                                    : 'Not set'
                                                }
                                            </p>
                                        </div>
                                    )}
                                </div>

                                {/* Days Until Next Evaluation */}
                                {profileData.nextEvaluationDate && !isEditingEvaluation && (
                                    <div>
                                        <p className="text-sm text-slate-400">Days Until Next Evaluation</p>
                                        <p className="text-2xl font-bold text-blue-400">
                                            {Math.max(0, Math.ceil((new Date(profileData.nextEvaluationDate) - new Date()) / (1000 * 60 * 60 * 24)))}
                                        </p>
                                    </div>
                                )}

                                {/* Employee Status */}
                                <div>
                                    <p className="text-sm text-slate-400">Employee Status</p>
                                    <p className="text-slate-200 capitalize">{profileData.employeeStatus || 'Not set'}</p>
                                </div>
                            </div>
                        </div>

                        {/* Education Section */}
                        <div className="bg-muted p-6 rounded-lg">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-lg font-semibold text-slate-200">Education</h3>
                            </div>
                            {profileData.education && profileData.education.length > 0 ? (
                                <div className="space-y-4">
                                    {profileData.education.map((edu, index) => (
                                        <div key={index} className="border-l-2 border-blue-500 pl-4 py-1">
                                            <h4 className="font-medium text-slate-200">{edu.degree}</h4>
                                            <p className="text-slate-400">{edu.institution}</p>
                                            <p className="text-sm text-slate-500">{edu.year}</p>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-slate-500">No education information provided.</p>
                            )}
                        </div>

                        {/* Qualifications Section */}
                        <div className="bg-muted p-6 rounded-lg">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-lg font-semibold text-slate-200">Qualifications</h3>
                            </div>
                            {profileData.qualifications && profileData.qualifications.length > 0 ? (
                                <div className="space-y-4">
                                    {profileData.qualifications.map((qual, index) => (
                                        <div key={index} className="border-l-2 border-green-500 pl-4 py-1">
                                            <h4 className="font-medium text-slate-200">{qual.title}</h4>
                                            <p className="text-slate-400">{qual.issuer}</p>
                                            <p className="text-sm text-slate-500">{qual.date}</p>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-slate-500">No qualifications information provided.</p>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </DashboardLayout>
    );
}