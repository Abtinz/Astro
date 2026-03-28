import React from 'react';

interface StepperProps {
  currentStep: 1 | 2 | 3;
}

const STEPS = [
  { number: 1, label: 'Upload' },
  { number: 2, label: '3D Render' },
  { number: 3, label: '3D Scene' },
];

const Stepper: React.FC<StepperProps> = ({ currentStep }) => {
  return (
    <div className="stepper">
      {STEPS.map((step, index) => (
        <React.Fragment key={step.number}>
          <div className={`stepper-step ${
            step.number < currentStep ? 'completed' :
            step.number === currentStep ? 'active' : 'pending'
          }`}>
            <div className="stepper-circle">
              {step.number < currentStep ? '✓' : step.number}
            </div>
            <div className="stepper-label">{step.label}</div>
          </div>
          {index < STEPS.length - 1 && (
            <div className={`stepper-line ${step.number < currentStep ? 'completed' : ''}`} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
};

export default Stepper;
