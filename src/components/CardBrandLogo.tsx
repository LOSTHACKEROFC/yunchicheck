import React from 'react';

interface CardBrandLogoProps {
  brand: string;
  size?: 'xs' | 'sm' | 'md';
  className?: string;
}

export const CardBrandLogo: React.FC<CardBrandLogoProps> = ({ brand, size = 'sm', className = '' }) => {
  const sizeClasses = {
    xs: 'w-5 h-3',
    sm: 'w-6 h-4',
    md: 'w-10 h-7'
  };

  const baseClass = `${sizeClasses[size]} ${className} shrink-0`;

  switch (brand.toLowerCase()) {
    case 'visa':
      return (
        <svg viewBox="0 0 48 32" className={baseClass}>
          <rect width="48" height="32" rx="4" fill="#1A1F71"/>
          <path d="M19.8 21.5H17L18.8 10.5H21.6L19.8 21.5ZM14.4 10.5L11.8 18.1L11.4 16.2L10.3 11.6C10.3 11.6 10.2 10.5 8.8 10.5H4.1L4 10.7C4 10.7 5.6 11.1 7.5 12.2L10 21.5H12.9L17.4 10.5H14.4ZM38.1 21.5H40.6L38.4 10.5H36.1C34.9 10.5 34.6 11.5 34.6 11.5L30.4 21.5H33.3L33.9 19.8H37.4L37.8 21.5H38.1ZM34.6 17.5L36.1 13.3L36.9 17.5H34.6ZM30.2 13.3L30.6 10.8C30.6 10.8 29.1 10.3 27.5 10.3C25.8 10.3 21.8 11.1 21.8 14.6C21.8 17.9 26.4 17.9 26.4 19.6C26.4 21.3 22.3 20.8 20.9 19.7L20.5 22.3C20.5 22.3 22 23 24.3 23C26.6 23 30.3 21.7 30.3 18.5C30.3 15.2 25.6 14.9 25.6 13.4C25.6 11.9 28.7 12.1 30.2 13.3Z" fill="white"/>
        </svg>
      );

    case 'mastercard':
      return (
        <svg viewBox="0 0 48 32" className={baseClass}>
          <rect width="48" height="32" rx="4" fill="#000"/>
          <circle cx="18" cy="16" r="10" fill="#EB001B"/>
          <circle cx="30" cy="16" r="10" fill="#F79E1B"/>
          <path d="M24 8.5C26.2 10.2 27.6 12.9 27.6 16C27.6 19.1 26.2 21.8 24 23.5C21.8 21.8 20.4 19.1 20.4 16C20.4 12.9 21.8 10.2 24 8.5Z" fill="#FF5F00"/>
        </svg>
      );

    case 'amex':
      return (
        <svg viewBox="0 0 48 32" className={baseClass}>
          <rect width="48" height="32" rx="4" fill="#006FCF"/>
          <path d="M5 16L7.5 10H11L14.5 16L11 22H7.5L5 16ZM13 10H23V12.5H16V14.5H22.5V17H16V19H23V22H13V10ZM25 10H29L31.5 14L34 10H38L33 16L38 22H34L31.5 18L29 22H25L30 16L25 10ZM24 16L21 10H25L26.5 13L28 10H32L29 16L32 22H28L26.5 19L25 22H21L24 16Z" fill="white"/>
        </svg>
      );

    case 'discover':
      return (
        <svg viewBox="0 0 48 32" className={baseClass}>
          <rect width="48" height="32" rx="4" fill="#FFF"/>
          <rect x="0.5" y="0.5" width="47" height="31" rx="3.5" stroke="#DDD"/>
          <path d="M0 18C8 18 16 24 24 24C32 24 40 18 48 18V32H0V18Z" fill="#F76F1B"/>
          <circle cx="28" cy="14" r="6" fill="#F76F1B"/>
          <text x="6" y="15" fontSize="6" fontWeight="bold" fill="#000">DISCOVER</text>
        </svg>
      );

    case 'jcb':
      return (
        <svg viewBox="0 0 48 32" className={baseClass}>
          <rect width="48" height="32" rx="4" fill="#FFF"/>
          <rect x="0.5" y="0.5" width="47" height="31" rx="3.5" stroke="#DDD"/>
          <rect x="6" y="4" width="11" height="24" rx="4" fill="#0E4C96"/>
          <rect x="18" y="4" width="11" height="24" rx="4" fill="#E21836"/>
          <rect x="30" y="4" width="11" height="24" rx="4" fill="#00A94F"/>
          <text x="8" y="20" fontSize="8" fontWeight="bold" fill="white">J</text>
          <text x="20.5" y="20" fontSize="8" fontWeight="bold" fill="white">C</text>
          <text x="33" y="20" fontSize="8" fontWeight="bold" fill="white">B</text>
        </svg>
      );

    case 'maestro':
      return (
        <svg viewBox="0 0 48 32" className={baseClass}>
          <rect width="48" height="32" rx="4" fill="#FFF"/>
          <rect x="0.5" y="0.5" width="47" height="31" rx="3.5" stroke="#DDD"/>
          <circle cx="18" cy="16" r="10" fill="#6C6BBD"/>
          <circle cx="30" cy="16" r="10" fill="#E01E5A"/>
          <path d="M24 8.5C26.2 10.2 27.6 12.9 27.6 16C27.6 19.1 26.2 21.8 24 23.5C21.8 21.8 20.4 19.1 20.4 16C20.4 12.9 21.8 10.2 24 8.5Z" fill="#6F6BBE"/>
        </svg>
      );

    case 'unionpay':
      return (
        <svg viewBox="0 0 48 32" className={baseClass}>
          <rect width="48" height="32" rx="4" fill="#1A3668"/>
          <g transform="skewX(-12)">
            <rect x="12" y="4" width="12" height="24" fill="#E21836"/>
            <rect x="24" y="4" width="12" height="24" fill="#00447C"/>
            <rect x="36" y="4" width="12" height="24" fill="#007B84"/>
          </g>
          <text x="14" y="20" fontSize="7" fontWeight="bold" fill="white">银联</text>
          <text x="28" y="26" fontSize="4" fill="white">UnionPay</text>
        </svg>
      );

    case 'diners club':
    case 'diners':
      return (
        <svg viewBox="0 0 48 32" className={baseClass}>
          <rect width="48" height="32" rx="4" fill="#FFF"/>
          <rect x="0.5" y="0.5" width="47" height="31" rx="3.5" stroke="#DDD"/>
          <circle cx="24" cy="16" r="11" fill="none" stroke="#004A97" strokeWidth="2"/>
          <path d="M18 10V22M18 16H30M30 10V22" stroke="#004A97" strokeWidth="2" fill="none"/>
        </svg>
      );

    case 'rupay':
      return (
        <svg viewBox="0 0 48 32" className={baseClass}>
          <rect width="48" height="32" rx="4" fill="#1A237E"/>
          <path d="M6 8H18C20 8 22 10 22 12V14C22 16 20 18 18 18H12V24H6V8Z" fill="#FF9800"/>
          <text x="24" y="20" fontSize="8" fontWeight="bold" fill="#FFF">Pay</text>
        </svg>
      );

    case 'mir':
      return (
        <svg viewBox="0 0 48 32" className={baseClass}>
          <rect width="48" height="32" rx="4" fill="#FFF"/>
          <rect x="0.5" y="0.5" width="47" height="31" rx="3.5" stroke="#DDD"/>
          <path d="M6 10H12L14 16L16 10H22V22H18V14L16 22H12L10 14V22H6V10Z" fill="#0F754E"/>
          <path d="M24 10H28V22H24V10ZM30 10H36C38 10 40 11 40 14C40 17 38 18 36 18H34V22H30V10Z" fill="#0F754E"/>
          <circle cx="42" cy="14" r="3" fill="#FF6600"/>
        </svg>
      );

    case 'elo':
      return (
        <svg viewBox="0 0 48 32" className={baseClass}>
          <rect width="48" height="32" rx="4" fill="#000"/>
          <circle cx="14" cy="16" r="8" fill="#FFCB05"/>
          <circle cx="24" cy="16" r="8" fill="#00A4E0"/>
          <circle cx="34" cy="16" r="8" fill="#EE4023"/>
          <text x="10" y="19" fontSize="6" fontWeight="bold" fill="#000">e</text>
          <text x="20" y="19" fontSize="6" fontWeight="bold" fill="#FFF">l</text>
          <text x="30" y="19" fontSize="6" fontWeight="bold" fill="#FFF">o</text>
        </svg>
      );

    default:
      return (
        <svg viewBox="0 0 48 32" className={baseClass}>
          <rect width="48" height="32" rx="4" fill="#374151"/>
          <rect x="6" y="8" width="36" height="4" rx="2" fill="#6B7280"/>
          <rect x="6" y="14" width="24" height="3" rx="1.5" fill="#6B7280"/>
          <rect x="6" y="20" width="16" height="3" rx="1.5" fill="#6B7280"/>
        </svg>
      );
  }
};

export default CardBrandLogo;
