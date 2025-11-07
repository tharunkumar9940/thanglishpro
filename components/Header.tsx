
import React from 'react';
import { LogoIcon } from './icons/Icons';

const Header: React.FC = () => {
    return (
        <header className="text-center">
            <div className="flex items-center justify-center gap-4">
                <LogoIcon className="w-12 h-12 text-amber-400" />
                <div>
                    <h1 className="text-4xl font-bold text-white tracking-tight">Thanglish Pro</h1>
                    <p className="text-md text-gray-400 mt-1">AI-Powered Subtitle Generation</p>
                </div>
            </div>
        </header>
    );
};

export default Header;