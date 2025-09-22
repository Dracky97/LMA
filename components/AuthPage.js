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
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetMessage, setResetMessage] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const { login, resetPassword } = useAuth();

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

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    if (!resetEmail) {
      setError('Please enter your email address');
      return;
    }
    
    setResetLoading(true);
    setError('');
    setResetMessage('');
    
    try {
      await resetPassword(resetEmail);
      setResetMessage('Password reset email sent! Check your inbox and follow the instructions.');
      setResetEmail('');
    } catch (err) {
      setError(err.message);
    } finally {
      setResetLoading(false);
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
      
      {resetMessage && (
        <div className="mb-4 p-3 bg-green-900/30 text-green-300 rounded-md text-sm">
          {resetMessage}
        </div>
      )}
      
      {!showForgotPassword ? (
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
          
          <div className="text-center mt-4">
            <button
              type="button"
              onClick={() => setShowForgotPassword(true)}
              className="text-blue-400 hover:text-blue-300 text-sm underline focus:outline-none"
            >
              Forgot your password?
            </button>
          </div>
        </form>
      ) : (
        <form onSubmit={handleForgotPassword} className="bg-card p-6 rounded-lg shadow-sm border border-gray-700">
          <h3 className="text-lg font-medium text-slate-200 mb-4">Reset Password</h3>
          <p className="text-sm text-slate-400 mb-4">
  Enter your email address and we&apos;ll send you a link to reset your password.
</p>
          
          <InputField
            label="Email Address"
            type="email"
            value={resetEmail}
            onChange={(e) => setResetEmail(e.target.value)}
            placeholder="Enter your email"
            required
          />
          
          <div className="flex space-x-3">
            <button
              type="button"
              onClick={() => {
                setShowForgotPassword(false);
                setResetEmail('');
                setError('');
                setResetMessage('');
              }}
              className="flex-1 border border-gray-600 text-slate-300 py-2 px-4 rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 transition duration-150 ease-in-out"
            >
              Back to Login
            </button>
            <button
              type="submit"
              disabled={resetLoading}
              className={`flex-1 py-2 px-4 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition duration-150 ease-in-out ${
                resetLoading
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
            >
              {resetLoading ? (
                <div className="flex items-center justify-center">
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Sending...
                </div>
              ) : (
                'Send Reset Link'
              )}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
