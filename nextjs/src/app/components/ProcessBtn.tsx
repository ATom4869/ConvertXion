import React from "react";

interface ProcessBtnProps {
    text?: string; // Allow passing custom text, defaulting to "Process File"
    className?: string; // Allow passing custom class names
    onClick?: () => void; // Handle click event
    disabled?: boolean; // Allow disabling the button
}

const ProcessBtn: React.FC<ProcessBtnProps> = ({
    text = "Process File",
    className = "",
    onClick,
    disabled = false
}) => {
    return (
        <button
            className={`btn btn-primary mt-4 px-4 py-2 hover:bg-blue-600 text-neutral rounded-lg ${className}`}
            onClick={onClick}
            disabled={disabled}
        >
            {text}
        </button>
    );
};

export default ProcessBtn;
