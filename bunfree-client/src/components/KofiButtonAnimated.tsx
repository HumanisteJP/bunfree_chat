import React from 'react';
import './KofiButtonAnimated.css';

interface KofiButtonAnimatedProps {
  kofiId: string;
  label?: string;
  color?: string;
}

const KofiButtonAnimated: React.FC<KofiButtonAnimatedProps> = ({
  kofiId = 'C0C81AQPW8',
  label = 'サポートする',
  color = '#72a4f2'
}) => {
  return (
    <div className="kofi-btn-container">
      <a 
        title="Support me on ko-fi.com" 
        className="kofi-button" 
        style={{backgroundColor: color}} 
        href={`https://ko-fi.com/${kofiId}`} 
        target="_blank"
        rel="noopener noreferrer"
      >
        <span className="kofitext">
          <img 
            src="https://storage.ko-fi.com/cdn/cup-border.png" 
            alt="Ko-fi donations" 
            className="kofiimg"
          />
          {label}
        </span>
      </a>
    </div>
  );
};

export default KofiButtonAnimated; 