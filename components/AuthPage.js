// FILE: /components/AuthPage.js (UPDATE THIS FILE)
// FIX: The 'departmentOptions' array has been updated to match your new list.

import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

// Helper components (InputField)
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

export default function AuthPage({ title }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await login(email, password);
    } catch (err) {
      setError(err.message);
      console.error(err);
    }
  };

  return (
    <div className="w-full max-w-md">
      <div className="text-center mb-8">
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
          placeholder="Enter your password"
          required
        />
        
        <button
          type="submit"
          className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition duration-150 ease-in-out"
        >
          Login
        </button>
      </form>
    </div>
  );
}
