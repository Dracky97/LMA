import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import DashboardLayout from '../../components/DashboardLayout';
import { useAuth } from '../../context/AuthContext';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import { app } from '../../lib/firebase-client';

const db = getFirestore(app);

export default function ProfilePage() {
    const router = useRouter();
    const { userId } = router.query;
    const { userData: currentUserData } = useAuth();
    const [profileData, setProfileData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!userId) return;

        const fetchProfile = async () => {
            const userDocRef = doc(db, 'users', userId);
            try {
                const docSnap = await getDoc(userDocRef);
                if (docSnap.exists()) {
                    setProfileData(docSnap.data());
                }
            } catch (error) {
                console.error("Error fetching profile:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchProfile();
    }, [userId]);

    if (loading) return <DashboardLayout><div>Loading profile...</div></DashboardLayout>;
    if (!profileData) return <DashboardLayout><div>User not found.</div></DashboardLayout>;

    const canEdit = currentUserData?.uid === userId || currentUserData?.role === 'Admin';

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
                            <p className="text-lg text-slate-400 mt-1">{profileData.role} - {profileData.department}</p>
                            <p className="text-slate-500 mt-2">{profileData.personalDetails?.address || 'Location not specified'}</p>
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