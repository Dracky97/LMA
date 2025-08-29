import React, { useState, useEffect } from 'react';
import DashboardLayout from '../../components/DashboardLayout';
import { useAuth } from '../../context/AuthContext';
import { getFirestore, doc, updateDoc } from 'firebase/firestore';
import { app } from '../../lib/firebase-client';
import { useRouter } from 'next/router';

const db = getFirestore(app);

export default function EditProfilePage() {
    const { userData } = useAuth();
    const router = useRouter();
    const [formData, setFormData] = useState(null);

    useEffect(() => {
        if (userData) {
            setFormData({
                name: userData.name || '',
                employeeNumber: userData.employeeNumber || '',
                personalDetails: userData.personalDetails || { phone: '', address: '', dob: '' },
                socialMedia: userData.socialMedia || { linkedin: '', twitter: '' },
                education: userData.education || [],
                qualifications: userData.qualifications || []
            });
        }
    }, [userData]);

    const handleChange = (e, section, index = null, subSection = null) => {
        const { name, value } = e.target;
        
        if (section && index !== null && subSection) {
            // Handle nested array objects (education/qualifications)
            setFormData(prev => ({
                ...prev,
                [section]: prev[section].map((item, i) =>
                    i === index ? { ...item, [subSection]: { ...item[subSection], [name]: value } } : item
                )
            }));
        } else if (section && index !== null) {
            // Handle array objects (education/qualifications)
            setFormData(prev => ({
                ...prev,
                [section]: prev[section].map((item, i) =>
                    i === index ? { ...item, [name]: value } : item
                )
            }));
        } else if (section) {
            // Handle nested objects (personalDetails/socialMedia)
            setFormData(prev => ({
                ...prev,
                [section]: { ...prev[section], [name]: value }
            }));
        } else {
            // Handle top-level fields
            setFormData(prev => ({ ...prev, [name]: value }));
        }
    };

    const addEducation = () => {
        setFormData(prev => ({
            ...prev,
            education: [...prev.education, { degree: '', institution: '', year: '' }]
        }));
    };

    const removeEducation = (index) => {
        setFormData(prev => ({
            ...prev,
            education: prev.education.filter((_, i) => i !== index)
        }));
    };

    const addQualification = () => {
        setFormData(prev => ({
            ...prev,
            qualifications: [...prev.qualifications, { title: '', issuer: '', date: '' }]
        }));
    };

    const removeQualification = (index) => {
        setFormData(prev => ({
            ...prev,
            qualifications: prev.qualifications.filter((_, i) => i !== index)
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!userData) return;
        const userDocRef = doc(db, 'users', userData.uid);
        try {
            await updateDoc(userDocRef, formData);
            router.push(`/profile/${userData.uid}`);
        } catch (error) {
            console.error("Error updating profile:", error);
        }
    };

    if (!formData) return <DashboardLayout><div>Loading...</div></DashboardLayout>;

    return (
        <DashboardLayout>
            <div className="bg-card rounded-lg shadow-sm">
                <div className="border-b border-gray-700 px-6 py-4">
                    <h1 className="text-2xl font-bold text-slate-200">Edit Your Profile</h1>
                </div>
                
                <form onSubmit={handleSubmit} className="p-6 space-y-8">
                    {/* Basic Information Section */}
                    <div className="bg-muted p-6 rounded-lg">
                        <h2 className="text-xl font-semibold text-slate-200 mb-4">Basic Information</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1">Full Name</label>
                                <input
                                    type="text"
                                    name="name"
                                    value={formData.name}
                                    onChange={(e) => handleChange(e)}
                                    className="w-full px-3 py-2 border border-gray-600 rounded-md text-slate-200 bg-card focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    required
                                />
                            </div>
                            
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1">Employee Number</label>
                                <input
                                    type="text"
                                    name="employeeNumber"
                                    value={formData.employeeNumber}
                                    onChange={(e) => handleChange(e)}
                                    className="w-full px-3 py-2 border border-gray-600 rounded-md text-slate-200 bg-card focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                            
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1">Date of Birth</label>
                                <input
                                    type="date"
                                    name="dob"
                                    value={formData.personalDetails.dob}
                                    onChange={(e) => handleChange(e, 'personalDetails')}
                                    className="w-full px-3 py-2 border border-gray-600 rounded-md text-slate-200 bg-card focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                            
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1">Phone Number</label>
                                <input
                                    type="text"
                                    name="phone"
                                    value={formData.personalDetails.phone}
                                    onChange={(e) => handleChange(e, 'personalDetails')}
                                    className="w-full px-3 py-2 border border-gray-600 rounded-md text-slate-200 bg-card focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                            
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1">Address</label>
                                <input
                                    type="text"
                                    name="address"
                                    value={formData.personalDetails.address}
                                    onChange={(e) => handleChange(e, 'personalDetails')}
                                    className="w-full px-3 py-2 border border-gray-600 rounded-md text-slate-200 bg-card focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                        </div>
                    </div>
                    
                    {/* Education Section */}
                    <div className="bg-muted p-6 rounded-lg">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-semibold text-slate-200">Education</h2>
                            <button
                                type="button"
                                onClick={addEducation}
                                className="bg-blue-600 text-white px-3 py-1 rounded-md text-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                Add Education
                            </button>
                        </div>
                        
                        {formData.education.length > 0 ? (
                            <div className="space-y-4">
                                {formData.education.map((edu, index) => (
                                    <div key={index} className="grid grid-cols-1 md:grid-cols-12 gap-4 p-4 bg-card rounded-md border border-gray-700">
                                        <div className="md:col-span-5">
                                            <label className="block text-sm font-medium text-slate-300 mb-1">Degree</label>
                                            <input
                                                type="text"
                                                name="degree"
                                                value={edu.degree}
                                                onChange={(e) => handleChange(e, 'education', index)}
                                                className="w-full px-3 py-2 border border-gray-600 rounded-md text-slate-200 bg-card focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            />
                                        </div>
                                        
                                        <div className="md:col-span-5">
                                            <label className="block text-sm font-medium text-slate-300 mb-1">Institution</label>
                                            <input
                                                type="text"
                                                name="institution"
                                                value={edu.institution}
                                                onChange={(e) => handleChange(e, 'education', index)}
                                                className="w-full px-3 py-2 border border-gray-600 rounded-md text-slate-200 bg-card focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            />
                                        </div>
                                        
                                        <div className="md:col-span-1">
                                            <label className="block text-sm font-medium text-slate-300 mb-1">Year</label>
                                            <input
                                                type="text"
                                                name="year"
                                                value={edu.year}
                                                onChange={(e) => handleChange(e, 'education', index)}
                                                className="w-full px-3 py-2 border border-gray-600 rounded-md text-slate-200 bg-card focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            />
                                        </div>
                                        
                                        <div className="md:col-span-1 flex items-end">
                                            <button
                                                type="button"
                                                onClick={() => removeEducation(index)}
                                                className="w-full bg-red-600 text-white px-2 py-2 rounded-md text-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500"
                                            >
                                                Remove
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-slate-500">No education information added yet.</p>
                        )}
                    </div>
                    
                    {/* Qualifications Section */}
                    <div className="bg-muted p-6 rounded-lg">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-semibold text-slate-200">Qualifications</h2>
                            <button
                                type="button"
                                onClick={addQualification}
                                className="bg-blue-600 text-white px-3 py-1 rounded-md text-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                Add Qualification
                            </button>
                        </div>
                        
                        {formData.qualifications.length > 0 ? (
                            <div className="space-y-4">
                                {formData.qualifications.map((qual, index) => (
                                    <div key={index} className="grid grid-cols-1 md:grid-cols-12 gap-4 p-4 bg-card rounded-md border border-gray-700">
                                        <div className="md:col-span-5">
                                            <label className="block text-sm font-medium text-slate-300 mb-1">Title</label>
                                            <input
                                                type="text"
                                                name="title"
                                                value={qual.title}
                                                onChange={(e) => handleChange(e, 'qualifications', index)}
                                                className="w-full px-3 py-2 border border-gray-600 rounded-md text-slate-200 bg-card focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            />
                                        </div>
                                        
                                        <div className="md:col-span-5">
                                            <label className="block text-sm font-medium text-slate-300 mb-1">Issuer</label>
                                            <input
                                                type="text"
                                                name="issuer"
                                                value={qual.issuer}
                                                onChange={(e) => handleChange(e, 'qualifications', index)}
                                                className="w-full px-3 py-2 border border-gray-600 rounded-md text-slate-200 bg-card focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            />
                                        </div>
                                        
                                        <div className="md:col-span-1">
                                            <label className="block text-sm font-medium text-slate-300 mb-1">Date</label>
                                            <input
                                                type="text"
                                                name="date"
                                                value={qual.date}
                                                onChange={(e) => handleChange(e, 'qualifications', index)}
                                                className="w-full px-3 py-2 border border-gray-600 rounded-md text-slate-200 bg-card focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            />
                                        </div>
                                        
                                        <div className="md:col-span-1 flex items-end">
                                            <button
                                                type="button"
                                                onClick={() => removeQualification(index)}
                                                className="w-full bg-red-600 text-white px-2 py-2 rounded-md text-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500"
                                            >
                                                Remove
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-slate-500">No qualifications information added yet.</p>
                        )}
                    </div>
                    
                    {/* Social Media Section */}
                    <div className="bg-muted p-6 rounded-lg">
                        <h2 className="text-xl font-semibold text-slate-200 mb-4">Social Media</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1">LinkedIn Profile URL</label>
                                <input
                                    type="text"
                                    name="linkedin"
                                    value={formData.socialMedia.linkedin}
                                    onChange={(e) => handleChange(e, 'socialMedia')}
                                    className="w-full px-3 py-2 border border-gray-600 rounded-md text-slate-200 bg-card focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                            
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1">Twitter Profile URL</label>
                                <input
                                    type="text"
                                    name="twitter"
                                    value={formData.socialMedia.twitter}
                                    onChange={(e) => handleChange(e, 'socialMedia')}
                                    className="w-full px-3 py-2 border border-gray-600 rounded-md text-slate-200 bg-card focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                        </div>
                    </div>
                    
                    <div className="flex justify-end">
                        <button
                            type="submit"
                            className="bg-blue-600 text-white px-6 py-2 rounded-md font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition duration-150 ease-in-out"
                        >
                            Save Changes
                        </button>
                    </div>
                </form>
            </div>
        </DashboardLayout>
    );
}
