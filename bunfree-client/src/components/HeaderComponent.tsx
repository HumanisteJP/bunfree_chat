import React, { ReactNode } from 'react';
import styles from './HeaderComponent.module.css';

interface HeaderComponentProps {
  title: string;
  leftButton?: {
    icon: ReactNode;
    onClick: () => void;
    ariaLabel: string;
    title?: string;
  };
  rightButton?: {
    icon: ReactNode;
    onClick: () => void;
    ariaLabel: string;
    title?: string;
  };
}

const HeaderComponent: React.FC<HeaderComponentProps> = ({ 
  title, 
  leftButton, 
  rightButton 
}) => {
  return (
    <div className={styles["header"]}>
      <div className={styles["button-container"]}>
        {leftButton && (
          <button
            className={styles["header-button"]}
            onClick={leftButton.onClick}
            aria-label={leftButton.ariaLabel}
            title={leftButton.title || leftButton.ariaLabel}
          >
            {leftButton.icon}
          </button>
        )}
      </div>
      
      <h1>{title}</h1>
      
      <div className={styles["button-container"]}>
        {rightButton && (
          <button
            className={styles["header-button"]}
            onClick={rightButton.onClick}
            aria-label={rightButton.ariaLabel}
            title={rightButton.title || rightButton.ariaLabel}
          >
            {rightButton.icon}
          </button>
        )}
      </div>
    </div>
  );
};

export default HeaderComponent; 