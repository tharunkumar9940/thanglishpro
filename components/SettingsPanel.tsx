
import React, { useState, useEffect } from 'react';
import { Settings } from '../types';
import { ChevronDownIcon, InfoIcon } from './icons/Icons';

interface SettingsPanelProps {
    settings: Settings;
    setSettings: React.Dispatch<React.SetStateAction<Settings>>;
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({ settings, setSettings }) => {
    const [isOpen, setIsOpen] = useState(true);

    const handleSettingChange = <K extends keyof Settings,>(
        key: K,
        value: Settings[K]
    ) => {
        setSettings((prev) => ({ ...prev, [key]: value }));
    };

    const handleLinesChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        handleSettingChange('lines', event.target.value as 'Single' | 'Double');
    };

    const SettingSlider: React.FC<{ label: string; tooltip: string; value: number; min: number; max: number; step: number; unit: string; onChange: (value: number) => void; }> = ({ label, tooltip, value, min, max, step, unit, onChange }) => {
        const [isEditing, setIsEditing] = useState(false);
        const [inputValue, setInputValue] = useState<string>(value.toString());
        
        // Local state for the slider to ensure smooth dragging.
        // It's updated in real-time, while the parent state is updated on release.
        const [localSliderValue, setLocalSliderValue] = useState(value);

        // When the parent prop changes (e.g. from the text input), update the local slider value.
        useEffect(() => {
            setLocalSliderValue(value);
        }, [value]);

        // This effect keeps the text input value in sync with the slider value when not editing.
        useEffect(() => {
            if (!isEditing) {
                setInputValue(localSliderValue.toString());
            }
        }, [localSliderValue, isEditing]);


        const handleValueClick = () => {
            setInputValue(localSliderValue.toString()); // Start editing with current slider value
            setIsEditing(true);
        };
        
        // When text input changes are committed, update the parent state.
        const commitChange = () => {
            let numericValue = parseFloat(inputValue); // Use parseFloat to handle decimals.

            if (isNaN(numericValue)) {
                numericValue = value; // Revert on bad input
            } else {
                numericValue = Math.max(min, Math.min(max, numericValue));
            }
            
            onChange(numericValue); // This updates the parent `settings` state.
            setIsEditing(false);
        };

        const handleInputBlur = () => {
            commitChange();
        };

        const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Enter') {
                commitChange();
                (e.target as HTMLInputElement).blur();
            } else if (e.key === 'Escape') {
                setInputValue(value.toString()); // Revert to original committed value
                setIsEditing(false);
                (e.target as HTMLInputElement).blur();
            }
        };
        
        // This is called continuously while dragging. It only updates local state.
        const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
            setLocalSliderValue(parseFloat(e.target.value));
        };

        // This is called on release, committing the value to the parent component.
        const handleSliderCommit = () => {
            if (localSliderValue !== value) { // Only update if there's a change
                onChange(localSliderValue);
            }
        };

        const displayValue = !Number.isInteger(localSliderValue) && step < 1 ? localSliderValue.toFixed(1) : localSliderValue.toString();

        return (
            <div>
                <div className="flex justify-between items-center mb-1">
                    <label className="text-sm font-medium text-gray-300 flex items-center gap-1.5">
                        {label}
                        <span className="relative group">
                           <InfoIcon className="w-4 h-4 text-gray-500"/>
                           <span className="absolute bottom-full mb-2 w-48 p-2 text-xs text-white bg-gray-900 border border-gray-600 rounded-md invisible group-hover:visible transition-opacity opacity-0 group-hover:opacity-100 -translate-x-1/2 left-1/2 z-10">
                              {tooltip}
                           </span>
                        </span>
                    </label>
                    {isEditing ? (
                        <input
                            type="number"
                            value={inputValue}
                            min={min}
                            max={max}
                            step={step}
                            onChange={(e) => setInputValue(e.target.value)}
                            onBlur={handleInputBlur}
                            onKeyDown={handleInputKeyDown}
                            autoFocus
                            onFocus={(e) => e.target.select()}
                            className="w-20 text-sm font-mono bg-gray-900 border border-gray-600 text-white px-2 py-0.5 rounded text-right appearance-none [-moz-appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none focus:border-amber-400 focus:ring-amber-400/50 outline-none focus:ring-1"
                        />
                    ) : (
                        <span onClick={handleValueClick} className="text-sm font-mono bg-black/50 px-2 py-0.5 rounded cursor-pointer tabular-nums min-w-[70px] text-right">
                            {displayValue} <span className="text-gray-400">{unit}</span>
                        </span>
                    )}
                </div>
                <input
                    type="range"
                    min={min}
                    max={max}
                    step={step}
                    value={localSliderValue}
                    onChange={handleSliderChange} // Updates local state for smooth UI
                    onMouseUp={handleSliderCommit} // Commits to parent state on release
                    onTouchEnd={handleSliderCommit} // Commits to parent state on release for touch
                    className="w-full appearance-none cursor-pointer"
                />
                {label === "Maximum length in characters" && localSliderValue <= 10 && (
                    <p className="text-xs text-amber-300/80 mt-1.5 px-1">
                        Note: Hyper-Sync mode is active. Subtitles will be one word per line for maximum accuracy. Other settings will be ignored.
                    </p>
                )}
            </div>
        );
    };

    return (
        <div className="bg-gray-700/50 border border-gray-600 rounded-lg">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex justify-between items-center p-3 text-left font-semibold text-gray-100"
            >
                <span>Captioning Preferences</span>
                <ChevronDownIcon className={`w-5 h-5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            {isOpen && (
                <div className="p-4 border-t border-gray-600 space-y-5">
                    <SettingSlider
                        label="Maximum length in characters"
                        tooltip="Max number of characters per subtitle line. Set to 10 or below for single-word mode."
                        value={settings.maxLength}
                        min={7}
                        max={80}
                        step={1}
                        unit="chars"
                        onChange={(val) => handleSettingChange('maxLength', val)}
                    />
                    <SettingSlider
                        label="Minimum duration in seconds"
                        tooltip="The shortest duration a single subtitle can appear on screen."
                        value={settings.minDuration}
                        min={0.1}
                        max={10}
                        step={0.1}
                        unit="secs"
                        onChange={(val) => handleSettingChange('minDuration', val)}
                    />
                    <SettingSlider
                        label="Gap between captions"
                        tooltip="Minimum gap between the end of one caption and the start of the next."
                        value={settings.gap}
                        min={0}
                        max={10}
                        step={1}
                        unit="frames"
                        onChange={(val) => handleSettingChange('gap', val)}
                    />
                    <div>
                        <label className="text-sm font-medium text-gray-300 mb-2 block">Lines</label>
                        <div className="flex gap-4">
                            {(['Single', 'Double'] as const).map((lineOption) => (
                                <label key={lineOption} className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="radio"
                                        name="lines"
                                        value={lineOption}
                                        checked={settings.lines === lineOption}
                                        onChange={handleLinesChange}
                                        className="w-4 h-4 text-amber-500 bg-gray-700 border-gray-500 focus:ring-amber-500 ring-offset-gray-800 focus:ring-2"
                                    />
                                    <span className="text-sm">{lineOption}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SettingsPanel;