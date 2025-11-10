
import React, { useState, useCallback, useEffect } from 'react';
import { AppState, MockupType } from './types';
import FileUpload from './components/FileUpload';
import MockupEditor from './components/MockupEditor';
import ResultDisplay from './components/ResultDisplay';
import Spinner from './components/Spinner';
import { generateMockup } from './services/geminiService';
import { createCompositeImage, generateLocalMockup } from './utils/imageUtils';

export type DesignTransform = {
  position: { x: number; y: number };
  size: { width: number; height: number };
  rotation: number;
};

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.UPLOAD_FILES);
  const [walletImage, setWalletImage] = useState<string | null>(null);
  const [designImages, setDesignImages] = useState<string[]>([]);
  const [mockupResult, setMockupResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastEditorData, setLastEditorData] = useState<DesignTransform[] | null>(null);
  const [lastMockupType, setLastMockupType] = useState<MockupType>(MockupType.ENGRAVE);
  const [isDemoResult, setIsDemoResult] = useState<boolean>(false);

  useEffect(() => {
    if (walletImage && designImages.length > 0 && appState === AppState.UPLOAD_FILES) {
      const timer = setTimeout(() => {
        setAppState(AppState.EDIT);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [walletImage, designImages, appState]);

  const handleWalletUpload = (files: FileList) => {
    const file = files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      setWalletImage(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleDesignUpload = (files: FileList) => {
    const filePromises = Array.from(files).map(file => {
        return new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target?.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    });

    Promise.all(filePromises).then(newImages => {
        setDesignImages(prev => [...prev, ...newImages]);
    });
  };

  const handleRemoveDesign = (indexToRemove: number) => {
    setDesignImages(prev => prev.filter((_, index) => index !== indexToRemove));
  };

  const runGeneration = useCallback(async (editorData: DesignTransform[], containerSize: { width: number, height: number}, mockupType: MockupType) => {
    if (!walletImage || designImages.length === 0) return;

    setError(null);
    setAppState(AppState.GENERATING);
    
    // Check if any API key mechanism is available
    const isApiKeyConfigured = !!process.env.API_KEY || !!(window as any).aistudio;

    if (!isApiKeyConfigured) {
      console.log("No API key configured. Running in local simulation mode.");
      try {
        const resultBase64 = await generateLocalMockup(
          walletImage,
          designImages,
          editorData,
          containerSize,
          mockupType
        );
        setMockupResult(resultBase64);
        setIsDemoResult(true);
        setAppState(AppState.RESULT);
      } catch (err: any) {
        console.error("Error generating local mockup:", err);
        setError('Failed to generate local simulation.');
        setAppState(AppState.EDIT);
      }
      return;
    }

    // Existing API key logic for deployed environments
    if ((window as any).aistudio) {
        try {
            const hasKey = await (window as any).aistudio.hasSelectedApiKey();
            if (!hasKey) {
                await (window as any).aistudio.openSelectKey();
            }
        } catch (e) {
             console.error("Error with API key selection:", e);
             setError("An issue occurred with API key selection. Please refresh and try again.");
             setAppState(AppState.EDIT);
             return;
        }
    }

    try {
      const compositeImageBase64 = await createCompositeImage(
        walletImage,
        designImages,
        editorData,
        containerSize
      );
      
      const resultBase64 = await generateMockup(compositeImageBase64, mockupType);
      setMockupResult(resultBase64);
      setIsDemoResult(false);
      setAppState(AppState.RESULT);
    } catch (err: any) {
      console.error(err);
      if (err.message && (err.message.includes('API key not valid') || err.message.includes('Requested entity was not found') || err.message.includes('API_KEY'))) {
        setError('Your API Key is invalid or the project is missing billing information. Please select a valid key and try again.');
        if ((window as any).aistudio) {
            (window as any).aistudio.openSelectKey(); // Proactively ask for a new one
        }
      } else {
        setError('Failed to generate AI mockup. Please try again.');
      }
      setAppState(AppState.EDIT); // Always go back to edit on error
    }
  }, [walletImage, designImages]);

  const handleGenerate = useCallback(async (
    designs: DesignTransform[],
    containerSize: { width: number; height: number },
    mockupType: MockupType
  ) => {
    setLastEditorData(designs);
    setLastMockupType(mockupType);
    await runGeneration(designs, containerSize, mockupType);
  }, [runGeneration]);

  const handleRegenerate = useCallback(async () => {
    if (lastEditorData && walletImage) {
        const img = new Image();
        img.onload = () => {
            runGeneration(lastEditorData, { width: img.width, height: img.height}, lastMockupType);
        };
        img.src = walletImage;
    }
  }, [lastEditorData, runGeneration, walletImage, lastMockupType]);
  
  const handleAdjust = () => {
    setAppState(AppState.EDIT);
  };

  const handleReset = () => {
    setAppState(AppState.UPLOAD_FILES);
    setWalletImage(null);
    setDesignImages([]);
    setMockupResult(null);
    setError(null);
    setLastEditorData(null);
    setLastMockupType(MockupType.ENGRAVE);
    setIsDemoResult(false);
  };
  
  const renderDesignUploads = () => {
    return (
      <div className="flex flex-col w-full">
        {designImages.length > 0 && (
          <div className="mb-4">
            <h3 className="text-lg font-semibold text-white mb-2 text-center">Your Designs</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 p-2 bg-gray-900/50 rounded-lg">
              {designImages.map((src, index) => (
                <div key={index} className="relative group">
                  <img src={src} alt={`Design ${index + 1}`} className="w-full h-full object-contain rounded-md bg-gray-700 aspect-square" />
                  <button 
                    onClick={() => handleRemoveDesign(index)}
                    className="absolute top-1 right-1 w-6 h-6 bg-red-600/80 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-label="Remove design"
                  >
                    &#x2715;
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
        <FileUpload
          onFileSelect={handleDesignUpload}
          title={designImages.length === 0 ? "Step 2: Upload Design(s)" : "Add More Designs"}
          description="Use PNGs with a transparent background for best results."
          multiple
        />
      </div>
    );
  };

  const renderContent = () => {
    switch (appState) {
      case AppState.UPLOAD_FILES:
        return (
          <div className="w-full max-w-4xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="flex flex-col">
                {walletImage ? (
                  <div className="flex flex-col items-center text-center">
                    <h2 className="text-xl font-semibold text-white mb-4">Product Photo</h2>
                    <div className="p-2 bg-gray-700 rounded-lg shadow-lg w-full">
                      <img src={walletImage} alt="Product preview" className="rounded-md w-full object-contain max-h-64" />
                    </div>
                    <button
                      onClick={() => setWalletImage(null)}
                      className="mt-4 px-4 py-2 bg-gray-600 text-white font-semibold rounded-lg shadow-md hover:bg-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 focus:ring-offset-gray-800 transition-colors duration-200"
                    >
                      Change Product
                    </button>
                  </div>
                ) : (
                  <FileUpload
                    onFileSelect={handleWalletUpload}
                    title="Step 1: Upload Product Photo"
                    description="Select a clear, well-lit photo of the product."
                  />
                )}
              </div>
              {renderDesignUploads()}
            </div>
          </div>
        );
      case AppState.EDIT:
        if (walletImage && designImages.length > 0) {
          return (
            <MockupEditor
              walletImage={walletImage}
              designImages={designImages}
              onGenerate={handleGenerate}
              initialDesigns={lastEditorData}
            />
          );
        }
        return null;
      case AppState.GENERATING:
        return <Spinner text="Crafting your mockup... This may take a moment." />;
      case AppState.RESULT:
        if (mockupResult) {
          return (
            <ResultDisplay 
              mockupImage={mockupResult} 
              onReset={handleReset}
              onRegenerate={handleRegenerate}
              onAdjust={handleAdjust}
              isDemo={isDemoResult}
            />
          );
        }
        return null;
      default:
        return null;
    }
  };

  return (
    <div className="bg-gray-900 text-gray-100 min-h-screen flex flex-col items-center justify-center p-4 sm:p-6 lg:p-8 font-sans">
       <div className="w-full max-w-4xl mx-auto">
        <header className="text-center mb-8">
            <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">Realistic Mockup Generator</h1>
            <p className="text-gray-400 mt-2 text-lg">
              {appState === AppState.UPLOAD_FILES ? 'Upload a product photo and your design to get started.' : 'Create photorealistic previews of your custom designs.'}
            </p>
        </header>
        <main className="bg-gray-800 rounded-xl shadow-2xl p-6 sm:p-8 flex flex-col items-center justify-center min-h-[500px] w-full">
            {renderContent()}
            {error && appState === AppState.EDIT && (
              <p className="text-red-400 mt-4 text-center">{error}</p>
            )}
        </main>
         <footer className="text-center mt-8 text-gray-500 text-sm">
            <p>Powered by Gemini API</p>
        </footer>
       </div>
    </div>
  );
};

export default App;
