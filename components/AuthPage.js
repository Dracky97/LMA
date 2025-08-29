// FILE: /components/AuthPage.js (UPDATE THIS FILE)
// FIX: The 'departmentOptions' array has been updated to match your new list.

import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { getFirestore, collection, query, where, getDocs } from 'firebase/firestore';
import { app } from '../lib/firebase-client';
import DarkModeToggle from './DarkModeToggle';

const db = getFirestore(app);

// Helper components (InputField, SelectField)
const InputField = ({ label, type, value, onChange, placeholder, required = false }) => (
  <div className="mb-4">
    <label className="block text-sm font-medium text-slate-300 mb-1">{label}</label>
    <input
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      required={required}
      className="w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-200 bg-card"
    />
  </div>
);

const SelectField = ({ label, value, onChange, options, required = false }) => (
  <div className="mb-4">
    <label className="block text-sm font-medium text-slate-300 mb-1">{label}</label>
    <select
      value={value}
      onChange={onChange}
      required={required}
      className="w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-200 bg-card"
    >
      <option value="">Select {label}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  </div>
);

export default function AuthPage({ title, isSignup, onSwitch }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [department, setDepartment] = useState('');
  const [managers, setManagers] = useState([]);
  const [selectedManager, setSelectedManager] = useState('');
  const [error, setError] = useState('');
  const { signup, login } = useAuth();

  useEffect(() => {
    if (isSignup) {
      const fetchManagers = async () => {
        try {
          const q = query(collection(db, 'users'), where('isManager', '==', true));
          const querySnapshot = await getDocs(q);
          const managersData = querySnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));
          setManagers(managersData);
        } catch (err) {
          console.error('Error fetching managers:', err);
        }
      };
      fetchManagers();
    }
  }, [isSignup]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (isSignup) {
        await signup(name, email, password, department, selectedManager);
      } else {
        await login(email, password);
      }
    } catch (err) {
      setError(err.message);
      console.error(err);
    }
  };

  // --- UPDATED: List of departments from your request ---
  const departmentOptions = [
    { value: 'Human Resources', label: 'Human Resources' },
    { value: 'Finance', label: 'Finance' },
    { value: 'Academic', label: 'Academic' },
    { value: 'Marketing', label: 'Marketing' },
    { value: 'Administration', label: 'Administration' },
    { value: 'IT', label: 'IT' },
    { value: 'Registrar', label: 'Registrar' },
    { value: 'Student Support', label: 'Student Support' }
  ];

  return (
    <div className="w-full max-w-md">
      <div className="text-center mb-8">
<div className="flex justify-end mb-4">
          <DarkModeToggle />
        </div>
        <img
          className="mx-auto h-12 w-auto"
          src="https://aibs.edu.lk/wp-content/uploads/2025/05/Approved-AIBS-Logo-PNG-white.png"
          alt="Company Logo"
        />
        <h2 className="mt-6 text-3xl font-bold tracking-tight text-slate-200">{title}</h2>
      </div>
      
      {error && (
        <div className="mb-4 p-3 bg-red-900/30 text-red-300 rounded-md text-sm">
          {error}
        </div>
      )}
      
      <form onSubmit={handleSubmit} className="bg-card p-6 rounded-lg shadow-sm border border-gray-700">
        {isSignup && (
          <>
            <InputField
              label="Full Name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your full name"
              required
            />
            
            <SelectField
              label="Department"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              options={departmentOptions}
              required
            />
            
            <SelectField
              label="Manager"
              value={selectedManager}
              onChange={(e) => setSelectedManager(e.target.value)}
              options={managers.map(manager => ({
                value: manager.id,
                label: `${manager.name} (${manager.role})`
              }))}
            />
          </>
        )}
        
        <InputField
          label="Email Address"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Enter your email"
          required
        />
        
        <InputField
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={isSignup ? "Create a password" : "Enter your password"}
          required
        />
        
        <button
          type="submit"
          className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition duration-150 ease-in-out"
        >
          {isSignup ? 'Sign Up' : 'Login'}
        </button>
      </form>
      
      <div className="mt-6 text-center">
        <p className="text-sm text-slate-400">
          {isSignup ? 'Already have an account?' : "Don't have an account?"}{' '}
          <button
            onClick={onSwitch}
            className="font-medium text-blue-400 hover:text-blue-300 focus:outline-none focus:underline"
          >
            {isSignup ? 'Login here' : 'Sign up here'}
          </button>
        </p>
      </div>
    </div>
  );
}
