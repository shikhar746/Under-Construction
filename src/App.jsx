// import React, { useState, useEffect } from 'react'
// import Particles from './components/Particles';
// import TextType from './components/TextType';
// import './index.css';

// export const App = () => {
//   // Track window dimensions to force re-render on resize
//   const [screenKey, setScreenKey] = useState(0);

//   useEffect(() => {
//     const handleResize = () => {
//       // Incrementing the key forces React to destroy and rebuild the component 
//       // with the absolute exact new pixel dimensions of the phone or tablet.
//       setScreenKey(prev => prev + 1);
//     };

//     window.addEventListener('resize', handleResize);
//     window.addEventListener('orientationchange', handleResize);
    
//     return () => {
//       window.removeEventListener('resize', handleResize);
//       window.removeEventListener('orientationchange', handleResize);
//     };
//   }, []);

//   return (
//     // 'fixed inset-0' handles structural scaling over mobile dynamic toolbars (like Safari/Chrome URL bars)
//     <div className='fixed inset-0 w-full h-full bg-black overflow-hidden m-0 p-0 select-none touch-none'>
      
//       {/* 1. PARTICLES LAYER: Re-initializes seamlessly with screenKey on device rotation/resize */}
//       <div className='w-full h-full relative z-0'>
//         <Particles
//           key={screenKey}
//           particleColors={["#ffffff"]}
//           particleCount={200}
//           particleSpread={10}
//           speed={0.1}
//           particleBaseSize={100}
//           moveParticlesOnHover
//           alphaParticles={false}
//           disableRotation={false}
//           pixelRatio={1}
//         />
//       </div>

//       {/* 2. TEXT LAYER: Stays dead center on any display matrix, letting touches pass straight to canvas */}
//       <div className='absolute inset-0 z-10 flex justify-center items-center pointer-events-none p-4'>
//         <div className='flex flex-col items-center gap-6'>
//           <div 
//             className='w-full flex justify-center text-center font-mono text-2xl sm:text-4xl md:text-5xl font-bold tracking-widest uppercase text-sky-400'
//           >
//             <TextType 
//               text={["Website under construction"]}
//               typingSpeed={75}
//               showCursor
//               cursorCharacter="_"
//               cursorBlinkDuration={0.5}
//               cursorClassName='text-amber-300'
//             />
//           </div>

//           {/* LOADING BAR: Sits below the text, centered with the same layout */}
//           <div className='w-48 sm:w-64 md:w-80 h-1.5 bg-white/10 rounded-full overflow-hidden'>
//             <div 
//               className='h-full rounded-full bg-amber-300 animate-[fillBar_3s_ease-in-out_infinite]'
//             />
//           </div>
//         </div>
//       </div>

//     </div>
//   ) 
// }

// export default App   
import React, { useState, useEffect } from 'react'
import Particles from './components/Particles';
import TextType from './components/TextType';
import './index.css';

export const App = () => {
  // Track window dimensions to force re-render on resize
  const [screenKey, setScreenKey] = useState(0);

  useEffect(() => {
    const handleResize = () => {
      // Incrementing the key forces React to destroy and rebuild the component 
      // with the absolute exact new pixel dimensions of the phone or tablet.
      setScreenKey(prev => prev + 1);
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  return (
    // 'fixed inset-0' handles structural scaling over mobile dynamic toolbars (like Safari/Chrome URL bars)
    <div className='fixed inset-0 w-full h-full bg-black overflow-hidden m-0 p-0 select-none touch-none'>
      
      {/* 1. PARTICLES LAYER: Re-initializes seamlessly with screenKey on device rotation/resize */}
      <div className='w-full h-full relative z-0'>
        <Particles
          key={screenKey}
          particleColors={["#ffffff"]}
          particleCount={200}
          particleSpread={10}
          speed={0.1}
          particleBaseSize={100}
          moveParticlesOnHover
          alphaParticles={false}
          disableRotation={false}
          pixelRatio={1}
        />
      </div>

      {/* 2. TEXT LAYER: Stays dead center on any display matrix, letting touches pass straight to canvas */}
      <div className='absolute inset-0 z-10 flex justify-center items-center pointer-events-none p-4'>
        <div className='flex flex-col items-center gap-6'>
          <div className='w-full flex justify-center text-center text-white font-mono text-2xl sm:text-4xl md:text-5xl font-bold tracking-widest uppercase animate-pulse'>
            <TextType 
              text={["Website under construction"]}
              typingSpeed={75}
              showCursor
              cursorCharacter="_"
              cursorBlinkDuration={0.5}
            />
          </div>

          {/* LOADING BAR: Sits below the text, centered with the same layout */}
          <div className='w-48 sm:w-64 md:w-80 h-1.5 bg-white/10 rounded-full overflow-hidden'>
            <div className='h-full bg-white rounded-full animate-[fillBar_3s_ease-in-out_infinite]' />
          </div>
        </div>
      </div>

    </div>
  ) 
}

export default App