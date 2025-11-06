import React from 'react';

export default function MobilePreview() {
  return (
    <div className="flex-shrink-0 sticky top-6">
      {/* Mobile Phone Frame */}
      <div className="bg-gray-900 rounded-[2.5rem] p-3 shadow-2xl">
        {/* Screen */}
        <div 
          className="bg-white rounded-[2rem] overflow-hidden relative"
          style={{
            width: '180px',
            height: '360px'
          }}
        >
          {/* Status Bar */}
          <div className="bg-gray-50 px-4 py-2 flex items-center justify-between text-xs">
            <span className="font-semibold">9:41</span>
            <div className="flex items-center gap-1">
              <div className="w-4 h-3 border border-gray-400 rounded-sm relative">
                <div className="absolute inset-0.5 bg-gray-800 rounded-[1px]"></div>
              </div>
            </div>
          </div>
          
          {/* Content Area - Placeholder */}
          <div className="flex flex-col items-center justify-center h-full bg-gradient-to-b from-blue-50 to-white p-4">
            <div className="text-center">
              <div className="w-16 h-16 bg-gray-200 rounded-xl mx-auto mb-3 flex items-center justify-center">
                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
              </div>
              <p className="text-xs text-gray-500 font-medium">Mobile Preview</p>
              <p className="text-[10px] text-gray-400 mt-1">Coming soon</p>
            </div>
          </div>
        </div>
      </div>
      
      {/* Label */}
      <p className="text-xs text-gray-500 text-center mt-3 font-medium">Mobile App Preview</p>
    </div>
  );
}

