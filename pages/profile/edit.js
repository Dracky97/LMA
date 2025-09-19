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
    const { userData, changePassword } = useAuth();
    const router = useRouter();
    const [formData, setFormData] = useState(null);
    const [profileImage, setProfileImage] = useState(null);
    const [coverImage, setCoverImage] = useState(null);
    const [profileImagePreview, setProfileImagePreview] = useState(null);
    const [coverImagePreview, setCoverImagePreview] = useState(null);
    const [isUploading, setIsUploading] = useState(false);
    const [errors, setErrors] = useState({});
    const [showPasswordSection, setShowPasswordSection] = useState(false);
    const [passwordData, setPasswordData] = useState({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
    });
    const [passwordLoading, setPasswordLoading] = useState(false);
    const [passwordSuccess, setPasswordSuccess] = useState('');

    useEffect(() => {
        if (userData) {
            setFormData({
                name: userData.name || '',
                employeeNumber: userData.employeeNumber || '',
                designation: userData.designation || '',
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

    const validateImageFile = (file, type) => {
        return new Promise((resolve, reject) => {
            // Check file size (4MB max)
            const maxSize = 4 * 1024 * 1024; // 4MB in bytes
            if (file.size > maxSize) {
                reject('File size must be less than 4MB');
                return;
            }

            // Check file type
            if (!file.type.startsWith('image/')) {
                reject('Please select a valid image file');
                return;
            }

            // Check image dimensions
            const img = new Image();
            img.onload = () => {
                let isValidDimensions = false;
                
                if (type === 'profile') {
                    // Profile picture: 600x600px max
                    if (img.width <= 600 && img.height <= 600) {
                        isValidDimensions = true;
                    } else {
                        reject('Profile picture dimensions must be 600x600px or smaller');
                        return;
                    }
                } else if (type === 'cover') {
                    // Cover photo: 1400x225px max
                    if (img.width <= 1400 && img.height <= 225) {
                        isValidDimensions = true;
                    } else {
                        reject('Cover photo dimensions must be 1400x225px or smaller');
                        return;
                    }
                }
                
                if (isValidDimensions) {
                    resolve(true);
                }
            };
            
            img.onerror = () => {
                reject('Invalid image file');
            };
            
            img.src = URL.createObjectURL(file);
        });
    };

    const handleImageChange = async (e, type) => {
        const file = e.target.files[0];
        if (!file) return;

        // Clear previous errors
        setErrors(prev => ({ ...prev, [`${type}Image`]: null }));

        try {
            await validateImageFile(file, type);
            
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
        } catch (error) {
            setErrors(prev => ({ ...prev, [`${type}Image`]: error }));
            // Clear the file input
            e.target.value = '';
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
        
        // Check for validation errors
        if (errors.profileImage || errors.coverImage) {
            alert('Please fix image validation errors before submitting.');
            return;
        }
        
        setIsUploading(true);
        setErrors({});
        
        try {
            // Upload images if they exist
            let profileImageUrl = formData.profileImageUrl;
            let coverImageUrl = formData.coverImageUrl;
            
            if (profileImage) {
                profileImageUrl = await uploadImage(
                    profileImage,
                    `profile-images/${userData.uid}/profile-${Date.now()}.jpg`
                );
                if (!profileImageUrl) {
                    throw new Error('Failed to upload profile image');
                }
            }
            
            if (coverImage) {
                coverImageUrl = await uploadImage(
                    coverImage,
                    `profile-images/${userData.uid}/cover-${Date.now()}.jpg`
                );
                if (!coverImageUrl) {
                    throw new Error('Failed to upload cover image');
                }
            }
            
            // Update form data with image URLs
            const updatedFormData = {
                ...formData,
                profileImageUrl: profileImageUrl || formData.profileImageUrl,
                coverImageUrl: coverImageUrl || formData.coverImageUrl
            };
            
            const userDocRef = doc(db, 'users', userData.uid);
            await updateDoc(userDocRef, updatedFormData);
            
            // Success - redirect to profile
            router.push(`/profile/${userData.uid}`);
        } catch (error) {
            console.error("Error updating profile:", error);
            setErrors({ submit: 'Failed to update profile. Please try again.' });
        } finally {
            setIsUploading(false);
        }
    };

    const handlePasswordChange = (e) => {
        const { name, value } = e.target;
        setPasswordData(prev => ({
            ...prev,
            [name]: value
        }));
        // Clear password errors when user starts typing
        if (errors.password) {
            setErrors(prev => ({ ...prev, password: null }));
        }
    };

    const handlePasswordSubmit = async (e) => {
        e.preventDefault();
        setErrors(prev => ({ ...prev, password: null }));
        setPasswordSuccess('');
        
        // Validate passwords
        if (passwordData.newPassword !== passwordData.confirmPassword) {
            setErrors(prev => ({ ...prev, password: 'New passwords do not match' }));
            return;
        }
        
        if (passwordData.newPassword.length < 6) {
            setErrors(prev => ({ ...prev, password: 'New password must be at least 6 characters long' }));
            return;
        }
        
        setPasswordLoading(true);
        
        try {
            await changePassword(passwordData.currentPassword, passwordData.newPassword);
            setPasswordSuccess('Password updated successfully!');
            // Reset form
            setPasswordData({
                currentPassword: '',
                newPassword: '',
                confirmPassword: ''
            });
            // Hide success message after 3 seconds
            setTimeout(() => setPasswordSuccess(''), 3000);
        } catch (error) {
            setErrors(prev => ({ ...prev, password: error.message }));
        } finally {
            setPasswordLoading(false);
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
                                        <p className="text-xs text-slate-500 mt-1">JPG, PNG, GIF up to 4MB, max 600x600px</p>
                                        {errors.profileImage && (
                                            <p className="text-xs text-red-400 mt-1">{errors.profileImage}</p>
                                        )}
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
                                        <p className="text-xs text-slate-500 mt-1">JPG, PNG, GIF up to 4MB, max 1400x225px</p>
                                        {errors.coverImage && (
                                            <p className="text-xs text-red-400 mt-1">{errors.coverImage}</p>
                                        )}
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
                                <label className="block text-sm font-medium text-slate-300 mb-1">Designation</label>
                                <input
                                    type="text"
                                    name="designation"
                                    value={formData.designation}
                                    onChange={(e) => handleChange(e)}
                                    className="w-full px-3 py-2 border border-gray-600 rounded-md text-slate-200 bg-card focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="e.g., Senior Developer, Marketing Specialist"
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
                    
                    {/* Password Change Section */}
                    <div className="bg-muted p-6 rounded-lg">
                        <div className="flex justify-between items-center mb-4">
                            <div>
                                <h2 className="text-xl font-semibold text-slate-200">Security</h2>
                                <p className="text-sm text-slate-400 mt-1">Change your account password</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowPasswordSection(!showPasswordSection)}
                                className="bg-yellow-600 hover:bg-yellow-700 text-white px-4 py-2 rounded-md text-sm font-medium transition duration-150 ease-in-out"
                            >
                                {showPasswordSection ? 'Cancel' : 'Change Password'}
                            </button>
                        </div>
                        
                        {showPasswordSection && (
                            <form onSubmit={handlePasswordSubmit} className="space-y-4">
                                {errors.password && (
                                    <div className="bg-red-900/20 border border-red-500/50 rounded-md p-3">
                                        <p className="text-red-400 text-sm">{errors.password}</p>
                                    </div>
                                )}
                                
                                {passwordSuccess && (
                                    <div className="bg-green-900/20 border border-green-500/50 rounded-md p-3">
                                        <p className="text-green-400 text-sm">{passwordSuccess}</p>
                                    </div>
                                )}
                                
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-1">Current Password</label>
                                    <input
                                        type="password"
                                        name="currentPassword"
                                        value={passwordData.currentPassword}
                                        onChange={handlePasswordChange}
                                        required
                                        className="w-full px-3 py-2 border border-gray-600 rounded-md text-slate-200 bg-card focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        placeholder="Enter your current password"
                                    />
                                </div>
                                
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-1">New Password</label>
                                    <input
                                        type="password"
                                        name="newPassword"
                                        value={passwordData.newPassword}
                                        onChange={handlePasswordChange}
                                        required
                                        className="w-full px-3 py-2 border border-gray-600 rounded-md text-slate-200 bg-card focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        placeholder="Enter new password (min. 6 characters)"
                                    />
                                </div>
                                
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-1">Confirm New Password</label>
                                    <input
                                        type="password"
                                        name="confirmPassword"
                                        value={passwordData.confirmPassword}
                                        onChange={handlePasswordChange}
                                        required
                                        className="w-full px-3 py-2 border border-gray-600 rounded-md text-slate-200 bg-card focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        placeholder="Confirm new password"
                                    />
                                </div>
                                
                                <div className="flex justify-end space-x-3">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setShowPasswordSection(false);
                                            setPasswordData({
                                                currentPassword: '',
                                                newPassword: '',
                                                confirmPassword: ''
                                            });
                                            setErrors(prev => ({ ...prev, password: null }));
                                            setPasswordSuccess('');
                                        }}
                                        className="px-4 py-2 border border-gray-600 text-slate-300 rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 transition duration-150 ease-in-out"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={passwordLoading}
                                        className={`px-4 py-2 rounded-md font-medium focus:outline-none focus:ring-2 focus:ring-yellow-500 transition duration-150 ease-in-out ${
                                            passwordLoading
                                                ? 'bg-gray-400 cursor-not-allowed'
                                                : 'bg-yellow-600 hover:bg-yellow-700 text-white'
                                        }`}
                                    >
                                        {passwordLoading ? (
                                            <div className="flex items-center">
                                                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                </svg>
                                                Updating...
                                            </div>
                                        ) : (
                                            'Update Password'
                                        )}
                                    </button>
                                </div>
                            </form>
                        )}
                    </div>
                    
                    {errors.submit && (
                        <div className="bg-red-900/20 border border-red-500/50 rounded-md p-4 mb-4">
                            <p className="text-red-400 text-sm">{errors.submit}</p>
                        </div>
                    )}
                    
                    <div className="flex justify-end">
                        <button
                            type="submit"
                            disabled={isUploading}
                            className={`px-6 py-2 rounded-md font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition duration-150 ease-in-out ${
                                isUploading
                                    ? 'bg-gray-400 cursor-not-allowed'
                                    : 'bg-blue-600 hover:bg-blue-700 text-white'
                            }`}
                        >
                            {isUploading ? (
                                <div className="flex items-center">
                                    <svg className="animate-spin -ml-1 mr-3 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    Saving...
                                </div>
                            ) : (
                                'Save Changes'
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </DashboardLayout>
    );
}
