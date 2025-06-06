import React from 'react';
import styles from './KofiButtonAnimated.module.css';
import ReactGA from 'react-ga4';

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
  const handleKofiClick = () => {
    ReactGA.event({
      category: 'Support',
      action: 'KofiButtonClick',
      label: `KofiId: ${kofiId}`,
    });
  };

  return (
    <div className={styles["kofi-btn-container"]}>
      <a 
        title="Support me on ko-fi.com" 
        className={styles["kofi-button"]} 
        style={{backgroundColor: color}} 
        href={`https://ko-fi.com/${kofiId}`} 
        target="_blank"
        rel="noopener noreferrer"
        onClick={handleKofiClick}
      >
        <span className={styles.kofitext}>
          <img 
            src="https://storage.ko-fi.com/cdn/cup-border.png" 
            alt="Ko-fi donations" 
            className={styles.kofiimg}
          />
          {label}
        </span>
      </a>
    </div>
  );
};

export default KofiButtonAnimated; 