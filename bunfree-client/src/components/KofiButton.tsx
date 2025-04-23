import React from 'react';

interface KofiButtonProps {
  kofiId: string;
  label?: string;
  height?: number;
}

const KofiButton: React.FC<KofiButtonProps> = ({ 
  kofiId = 'C0C81AQPW8', 
  label = 'Buy Me a Coffee at ko-fi.com',
  height = 36
}) => {
  return (
    <a 
      href={`https://ko-fi.com/${kofiId}`} 
      target="_blank" 
      rel="noopener noreferrer"
      className="kofi-button"
    >
      <img 
        height={height} 
        style={{border: '0px', height: `${height}px`}} 
        src='https://storage.ko-fi.com/cdn/kofi5.png?v=6' 
        alt={label} 
      />
    </a>
  );
};

export default KofiButton; 