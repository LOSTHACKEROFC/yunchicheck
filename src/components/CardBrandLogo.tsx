import React from 'react';

interface CardBrandLogoProps {
  brand: string;
  size?: 'xs' | 'sm' | 'md';
  className?: string;
}

export const CardBrandLogo: React.FC<CardBrandLogoProps> = ({ brand, size = 'sm', className = '' }) => {
  const sizeClasses = {
    xs: 'w-4 h-3',
    sm: 'w-5 h-4',
    md: 'w-8 h-6'
  };

  const baseClass = `${sizeClasses[size]} ${className} rounded-sm flex items-center justify-center`;

  switch (brand.toLowerCase()) {
    case 'visa':
      return (
        <svg viewBox="0 0 48 32" className={baseClass}>
          <rect width="48" height="32" rx="4" fill="#1A1F71"/>
          <path d="M19.5 21H17.2L18.8 11H21.1L19.5 21ZM15.1 11L12.9 17.8L12.6 16.3L11.7 12C11.7 12 11.6 11 10.3 11H6.1L6 11.2C6 11.2 7.5 11.5 9.2 12.5L11.2 21H13.6L17.6 11H15.1ZM35.4 21H37.5L35.7 11H33.8C32.7 11 32.4 11.9 32.4 11.9L28.9 21H31.3L31.8 19.6H34.7L35.4 21ZM32.4 17.7L33.7 14L34.4 17.7H32.4ZM29.1 13.5L29.4 11.2C29.4 11.2 28.1 10.8 26.7 10.8C25.2 10.8 21.8 11.5 21.8 14.5C21.8 17.3 25.8 17.3 25.8 18.8C25.8 20.3 22.2 19.9 21 19L20.6 21.4C20.6 21.4 21.9 22 23.9 22C25.9 22 29.1 20.8 29.1 18C29.1 15.1 25 14.9 25 13.6C25 12.3 27.7 12.5 29.1 13.5Z" fill="white"/>
        </svg>
      );

    case 'mastercard':
      return (
        <svg viewBox="0 0 48 32" className={baseClass}>
          <rect width="48" height="32" rx="4" fill="#1A1A2E"/>
          <circle cx="18" cy="16" r="9" fill="#EB001B"/>
          <circle cx="30" cy="16" r="9" fill="#F79E1B"/>
          <path d="M24 9.5C25.9 11 27.2 13.3 27.2 16C27.2 18.7 25.9 21 24 22.5C22.1 21 20.8 18.7 20.8 16C20.8 13.3 22.1 11 24 9.5Z" fill="#FF5F00"/>
        </svg>
      );

    case 'amex':
      return (
        <svg viewBox="0 0 48 32" className={baseClass}>
          <rect width="48" height="32" rx="4" fill="#006FCF"/>
          <path d="M8 14L10.5 8H14L17.5 14H14.5L14 13H11L10.5 14H8ZM11.5 11.5H13.5L12.5 9.5L11.5 11.5ZM18 8L20 11L22 8H25L21.5 13V14H18.5V13L15 8H18ZM26 8H35V10H29V10.5H34.5V12H29V12.5H35V14H26V8ZM8 16L10.5 22H14L17.5 16H14.5L14 17H11L10.5 16H8ZM11.5 19.5H13.5L12.5 17.5L11.5 19.5ZM18 16H21V17.5H23.5V16H26.5V22H23.5V20H21V22H18V16ZM28 16H35V18H31V19H35V22H28V20H32V19H28V16Z" fill="white"/>
        </svg>
      );

    case 'discover':
      return (
        <svg viewBox="0 0 48 32" className={baseClass}>
          <rect width="48" height="32" rx="4" fill="#FFF"/>
          <rect x="0.5" y="0.5" width="47" height="31" rx="3.5" stroke="#E5E5E5"/>
          <path d="M0 16H24C24 22.6 29.4 28 36 28H48V32H0V16Z" fill="#F76F1B"/>
          <circle cx="30" cy="16" r="7" fill="#F76F1B"/>
          <text x="8" y="18" fontSize="7" fontWeight="bold" fill="#1A1A2E">DISCOVER</text>
        </svg>
      );

    case 'jcb':
      return (
        <svg viewBox="0 0 48 32" className={baseClass}>
          <rect width="48" height="32" rx="4" fill="#FFF"/>
          <rect x="8" y="6" width="10" height="20" rx="3" fill="#0E4C96"/>
          <rect x="19" y="6" width="10" height="20" rx="3" fill="#E21836"/>
          <rect x="30" y="6" width="10" height="20" rx="3" fill="#00A94F"/>
          <text x="10" y="19" fontSize="6" fontWeight="bold" fill="white">J</text>
          <text x="21.5" y="19" fontSize="6" fontWeight="bold" fill="white">C</text>
          <text x="32.5" y="19" fontSize="6" fontWeight="bold" fill="white">B</text>
        </svg>
      );

    case 'maestro':
      return (
        <svg viewBox="0 0 48 32" className={baseClass}>
          <rect width="48" height="32" rx="4" fill="#FFF"/>
          <rect x="0.5" y="0.5" width="47" height="31" rx="3.5" stroke="#E5E5E5"/>
          <circle cx="18" cy="16" r="9" fill="#6C6BBD"/>
          <circle cx="30" cy="16" r="9" fill="#EB001B"/>
          <path d="M24 9.5C25.9 11 27.2 13.3 27.2 16C27.2 18.7 25.9 21 24 22.5C22.1 21 20.8 18.7 20.8 16C20.8 13.3 22.1 11 24 9.5Z" fill="#7673C0"/>
        </svg>
      );

    case 'unionpay':
      return (
        <svg viewBox="0 0 48 32" className={baseClass}>
          <rect width="48" height="32" rx="4" fill="#1A3668"/>
          <path d="M8 6H18L22 26H12L8 6Z" fill="#E21836" transform="skewX(-10)"/>
          <path d="M18 6H28L32 26H22L18 6Z" fill="#00447C" transform="skewX(-10)"/>
          <path d="M28 6H38L42 26H32L28 6Z" fill="#007B84" transform="skewX(-10)"/>
          <text x="16" y="19" fontSize="5" fontWeight="bold" fill="white">银联</text>
        </svg>
      );

    case 'diners club':
    case 'diners':
      return (
        <svg viewBox="0 0 48 32" className={baseClass}>
          <rect width="48" height="32" rx="4" fill="#FFF"/>
          <rect x="0.5" y="0.5" width="47" height="31" rx="3.5" stroke="#E5E5E5"/>
          <circle cx="24" cy="16" r="10" fill="none" stroke="#004A97" strokeWidth="2"/>
          <circle cx="20" cy="16" r="4" fill="#004A97"/>
          <circle cx="28" cy="16" r="4" fill="#004A97"/>
        </svg>
      );

    default:
      return (
        <svg viewBox="0 0 48 32" className={baseClass}>
          <rect width="48" height="32" rx="4" fill="#6B7280"/>
          <rect x="8" y="10" width="32" height="4" rx="1" fill="#9CA3AF"/>
          <rect x="8" y="18" width="20" height="4" rx="1" fill="#9CA3AF"/>
        </svg>
      );
  }
};

export default CardBrandLogo;
