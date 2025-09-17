import React, { useState, useEffect } from 'react';
import DashboardLayout from '../../components/DashboardLayout';
import { useAuth } from '../../context/AuthContext';
import { getFirestore, doc, updateDoc } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { app } from '../../lib/firebase-client';
import { useRouter } from 'next/router';

const db = getFirestore(app);
const storage = getStorage(app);

export default function EditProfilePage() {
    const { userData } = useAuth();
    const router = useRouter();
    const [formData, setFormData] = useState(null);
    const [profileImage, setProfileImage] = useState(null);
    const [coverImage, setCoverImage] = useState(null);
    const [profileImagePreview, setProfileImagePreview] = useState(null);
    const [coverImagePreview, setCoverImagePreview] = useState(null);

    useEffect(() => {
        if (userData) {
            setFormData({
                name: userData.name || '',
                employeeNumber: userData.employeeNumber || '',
                personalDetails: userData.personalDetails || { phone: '', address: '', dob: '' },
                socialMedia: userData.socialMedia || { linkedin: '', twitter: '' },
                education: userData.education || [],
                qualifications: userData.qualifications || [],
                profileImageUrl: userData.profileImageUrl || '',
                coverImageUrl: userData.coverImageUrl || ''
            });
            
            // Set previews if images already exist
            if (userData.profileImageUrl) {
                setProfileImagePreview(userData.profileImageUrl);
            }
            if (userData.coverImageUrl) {
                setCoverImagePreview(userData.coverImageUrl);
            }
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

    const handleImageChange = (e, type) => {
        const file = e.target.files[0];
        if (file) {
            if (type === 'profile') {
                setProfileImage(file);
                // Create preview
                const reader = new FileReader();
                reader.onloadend = () => {
                    setProfileImagePreview(reader.result);
                };
                reader.readAsDataURL(file);
            } else if (type === 'cover') {
                setCoverImage(file);
                // Create preview
                const reader = new FileReader();
                reader.onloadend = () => {
                    setCoverImagePreview(reader.result);
                };
                reader.readAsDataURL(file);
            }
        }
    };

    const uploadImage = async (file, path) => {
        if (!file) return null;
        
        try {
            const imageRef = ref(storage, path);
            await uploadBytes(imageRef, file);
            const url = await getDownloadURL(imageRef);
            return url;
        } catch (error) {
            console.error("Error uploading image:", error);
            return null;
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
        
        try {
            // Upload images if they exist
            let profileImageUrl = formData.profileImageUrl;
            let coverImageUrl = formData.coverImageUrl;
            
            if (profileImage) {
                profileImageUrl = await uploadImage(
                    profileImage,
                    `profile-images/${userData.uid}/profile-${Date.now()}.jpg`
                );
            }
            
            if (coverImage) {
                coverImageUrl = await uploadImage(
                    coverImage,
                    `profile-images/${userData.uid}/cover-${Date.now()}.jpg`
                );
            }
            
            // Update form data with image URLs
            const updatedFormData = {
                ...formData,
                profileImageUrl: profileImageUrl || formData.profileImageUrl,
                coverImageUrl: coverImageUrl || formData.coverImageUrl
            };
            
            const userDocRef = doc(db, 'users', userData.uid);
            await updateDoc(userDocRef, updatedFormData);
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
                    {/* Profile Images Section */}
                    <div className="bg-muted p-6 rounded-lg">
                        <h2 className="text-xl font-semibold text-slate-200 mb-4">Profile Images</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Profile Picture */}
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1">Profile Picture</label>
                                <div className="flex items-center space-x-4">
                                    <div className="bg-gray-200 border-2 border-dashed border-gray-400 rounded-full w-16 h-16 flex items-center justify-center overflow-hidden">
                                        {profileImagePreview ? (
                                            <img
                                                src={profileImagePreview}
                                                alt="Profile Preview"
                                                className="w-full h-full object-cover"
                                            />
                                        ) : (
                                            <span className="text-gray-500">No Image</span>
                                        )}
                                    </div>
                                    <div>
                                        <input
                                            type="file"
                                            accept="image/*"
                                            onChange={(e) => handleImageChange(e, 'profile')}
                                            className="block w-full text-sm text-slate-400
                                                file:mr-4 file:py-2 file:px-4
                                                file:rounded-md file:border-0
                                                file:text-sm file:font-medium
                                                file:bg-blue-600 file:text-white
                                                hover:file:bg-blue-700
                                                file:cursor-pointer"
                                        />
                                        <p className="text-xs text-slate-500 mt-1">JPG, PNG, GIF up to 5MB</p>
                                    </div>
                                </div>
                            </div>
                            
                            {/* Cover Photo */}
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1">Cover Photo</label>
                                <div className="flex items-center space-x-4">
                                    <div className="bg-gray-200 border-2 border-dashed border-gray-400 rounded w-32 h-16 flex items-center justify-center overflow-hidden">
                                        {coverImagePreview ? (
                                            <img
                                                src={coverImagePreview}
                                                alt="Cover Preview"
                                                className="w-full h-full object-cover"
                                            />
                                        ) : (
                                            <span className="text-gray-500">No Image</span>
                                        )}
                                    </div>
                                    <div>
                                        <input
                                            type="file"
                                            accept="image/*"
                                            onChange={(e) => handleImageChange(e, 'cover')}
                                            className="block w-full text-sm text-slate-400
                                                file:mr-4 file:py-2 file:px-4
                                                file:rounded-md file:border-0
                                                file:text-sm file:font-medium
                                                file:bg-blue-600 file:text-white
                                                hover:file:bg-blue-700
                                                file:cursor-pointer"
                                        />
                                        <p className="text-xs text-slate-500 mt-1">JPG, PNG, GIF up to 5MB</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    
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
                                <label className="block text-sm font-medium text-slate-300 mb-1">Gender</label>
                                <select
                                    name="gender"
                                    value={formData.gender || ''}
                                    onChange={(e) => setFormData({...formData, gender: e.target.value})}
                                    className="w-full px-3 py-2 border border-gray-600 rounded-md text-slate-200 bg-card focus:outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                    <option value="">Select Gender</option>
                                    <option value="male">Male</option>
                                    <option value="female">Female</option>
                                </select>
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
