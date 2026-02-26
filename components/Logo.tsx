import React from 'react';

export const Logo: React.FC<{ className?: string }> = ({ className = "w-10 h-10" }) => (
  <svg className={className} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Base ground line */}
    <path d="M10 90L90 90" stroke="currentColor" strokeWidth="4" strokeLinecap="round"/>
    
    {/* Building 1 (Left) */}
    <rect x="20" y="45" width="20" height="45" rx="2" fill="currentColor" opacity="0.7"/>
    
    {/* Building 2 (Main) */}
    <rect x="45" y="25" width="25" height="65" rx="2" fill="currentColor"/>
    
    {/* Building 3 (Right) */}
    <rect x="75" y="55" width="15" height="35" rx="2" fill="currentColor" opacity="0.7"/>
    
    {/* Crane Arm Accent */}
    <path d="M57 25L90 12V25" stroke="#F59E0B" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
    <circle cx="90" cy="12" r="2" fill="#F59E0B"/>
    
    {/* Windows */}
    <rect x="52" y="35" width="11" height="4" rx="1" fill="white"/>
    <rect x="52" y="45" width="11" height="4" rx="1" fill="white"/>
    <rect x="52" y="55" width="11" height="4" rx="1" fill="white"/>
    <rect x="52" y="65" width="11" height="4" rx="1" fill="white"/>
  </svg>
);