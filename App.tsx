
import React, { useState, useEffect, useRef } from 'react';
import { Camera, UserCheck, RefreshCw, Trash2, ShieldCheck, AlertCircle, Info, Clock, CheckCircle2, ListFilter, History, UserMinus, X } from 'lucide-react';
import { UserFaceProfile, AppState, RecognitionResult, AttendanceRecord } from './types';
import { loadModels, getFaceDescriptor, calculateDistance } from './services/faceApi';

// Helper to inject the face-api.js script
const loadFaceApiScript = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    if ((window as any).faceapi) return resolve();
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load face-api.js script'));
    document.head.appendChild(script);
  });
};

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.LOADING_MODELS);
  const [profiles, setProfiles] = useState<UserFaceProfile[]>([]);
  const [attendanceLogs, setAttendanceLogs] = useState<AttendanceRecord[]>([]);
  const [currentResult, setCurrentResult] = useState<RecognitionResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [enrollName, setEnrollName] = useState("");
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanIntervalRef = useRef<number | null>(null);

  // Initialize
  useEffect(() => {
    const init = async () => {
      try {
        await loadFaceApiScript();
        await loadModels();
        const savedProfiles = JSON.parse(localStorage.getItem('face_profiles') || '[]');
        const savedLogs = JSON.parse(localStorage.getItem('attendance_logs') || '[]');
        setProfiles(savedProfiles);
        setAttendanceLogs(savedLogs);
        setAppState(AppState.READY);
      } catch (err) {
        setErrorMessage("Model initialization failed. Please check internet connection.");
        setAppState(AppState.ERROR);
      }
    };
    init();
  }, []);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
      }
    } catch (err) {
      setErrorMessage("Camera access denied.");
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
  };

  const handleRegister = async () => {
    if (!videoRef.current || !enrollName.trim()) {
      if (!enrollName.trim()) setErrorMessage("Please enter employee name first.");
      return;
    }
    setIsProcessing(true);
    setErrorMessage(null);

    try {
      const descriptor = await getFaceDescriptor(videoRef.current);
      if (!descriptor) {
        setErrorMessage("No face detected. Adjust lighting.");
      } else {
        const newProfile: UserFaceProfile = {
          id: crypto.randomUUID(),
          name: enrollName.trim(),
          descriptor: Array.from(descriptor),
          capturedAt: Date.now()
        };
        const updatedProfiles = [...profiles, newProfile];
        setProfiles(updatedProfiles);
        localStorage.setItem('face_profiles', JSON.stringify(updatedProfiles));
        setEnrollName("");
        setAppState(AppState.READY);
        stopCamera();
      }
    } catch (err) {
      setErrorMessage("Enrollment failed.");
    } finally {
      setIsProcessing(false);
    }
  };

  const performAutoScan = async () => {
    if (!videoRef.current || profiles.length === 0 || isProcessing) return;
    setIsProcessing(true);
    try {
      const descriptor = await getFaceDescriptor(videoRef.current);
      if (descriptor) {
        let bestMatchProfile: UserFaceProfile | null = null;
        let minDistance = 1.0;

        for (const profile of profiles) {
          const distance = calculateDistance(descriptor, profile.descriptor);
          if (distance < 0.5 && distance < minDistance) {
            minDistance = distance;
            bestMatchProfile = profile;
          }
        }

        if (bestMatchProfile) {
          const today = new Date().toISOString().split('T')[0];
          const currentTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          const currentDate = new Date().toLocaleDateString();
          let status: 'success' | 'already' = 'success';

          if (bestMatchProfile.lastClockIn === today) {
            status = 'already';
          } else {
            // Update profile with clock in status
            const updatedProfiles = profiles.map(p => 
              p.id === bestMatchProfile!.id ? { ...p, lastClockIn: today } : p
            );
            setProfiles(updatedProfiles);
            localStorage.setItem('face_profiles', JSON.stringify(updatedProfiles));

            // Record new log entry
            const newLog: AttendanceRecord = {
              id: crypto.randomUUID(),
              name: bestMatchProfile.name,
              date: currentDate,
              time: currentTime,
              timestamp: Date.now()
            };
            
            // Fetch latest from state to avoid stale closure issues
            setAttendanceLogs(prev => {
              const updatedLogs = [newLog, ...prev].slice(0, 100);
              localStorage.setItem('attendance_logs', JSON.stringify(updatedLogs));
              return updatedLogs;
            });
          }

          setCurrentResult({
            match: true,
            distance: minDistance,
            label: bestMatchProfile.name,
            clockInStatus: status,
            time: currentTime
          });

          // Pause scanning to show results for only 2 seconds as requested
          if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
          setTimeout(() => {
            setCurrentResult(null); // Clear the result display
            if (appState === AppState.VERIFYING || (streamRef.current && streamRef.current.active)) {
              startAutoScan();
            }
          }, 2000);
        }
      }
    } catch (err) {
      console.error("Scan error", err);
    } finally {
      setIsProcessing(false);
    }
  };

  const startAutoScan = () => {
    if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
    scanIntervalRef.current = window.setInterval(performAutoScan, 1500);
  };

  const initiateAttendance = async () => {
    setCurrentResult(null);
    setAppState(AppState.VERIFYING);
    await startCamera();
    startAutoScan();
  };

  const deleteProfile = (id: string) => {
    if(!confirm("Remove employee biometric record? This cannot be undone.")) return;
    const updated = profiles.filter(p => p.id !== id);
    setProfiles(updated);
    localStorage.setItem('face_profiles', JSON.stringify(updated));
  };

  const clearRegistry = () => {
    if(!confirm("DANGER: Remove ALL biometric profiles from this device? All staff will need to re-enroll.")) return;
    setProfiles([]);
    localStorage.removeItem('face_profiles');
  };

  const clearLogs = () => {
    if(!confirm("Clear all attendance logs?")) return;
    setAttendanceLogs([]);
    localStorage.removeItem('attendance_logs');
  };

  const deleteLogEntry = (id: string) => {
    if(!confirm("Permanently delete this attendance record?")) return;
    const updated = attendanceLogs.filter(log => log.id !== id);
    setAttendanceLogs(updated);
    localStorage.setItem('attendance_logs', JSON.stringify(updated));
  };

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 lg:p-10 space-y-10">
      {/* Header */}
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="bg-blue-600 p-2.5 rounded-2xl shadow-xl shadow-blue-900/20">
            <Clock className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-black text-white leading-tight">Mysyarikat Recognition</h1>
            <p className="text-gray-500 text-[10px] font-bold uppercase tracking-[0.2em]">Attendance System</p>
          </div>
        </div>
      </header>

      {errorMessage && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-4 rounded-2xl flex items-center gap-4 text-xs font-bold uppercase tracking-wider animate-in fade-in duration-300">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{errorMessage}</span>
          <button onClick={() => setErrorMessage(null)} className="ml-auto text-xl leading-none">&times;</button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Main Interface Area */}
        <div className="lg:col-span-8 flex flex-col">
          <div className="bg-gray-900 border border-gray-800 rounded-[2rem] overflow-hidden shadow-2xl flex flex-col h-full">
            {/* Viewfinder */}
            <div className="aspect-video bg-black relative flex items-center justify-center overflow-hidden">
              {(appState === AppState.REGISTERING || appState === AppState.VERIFYING) ? (
                <>
                  <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                    <div className="w-56 h-72 border-2 border-dashed border-blue-500/30 rounded-[2.5rem]" />
                  </div>
                  {appState === AppState.VERIFYING && !currentResult && (
                    <div className="absolute top-6 left-1/2 -translate-x-1/2 bg-blue-600/80 backdrop-blur-md px-5 py-2 rounded-full flex items-center gap-3">
                      <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                      <span className="text-[10px] font-black text-white uppercase tracking-widest">Auto Scanning</span>
                    </div>
                  )}
                  {isProcessing && appState === AppState.REGISTERING && (
                    <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center backdrop-blur-sm">
                      <RefreshCw className="w-10 h-10 text-blue-500 animate-spin mb-4" />
                      <p className="text-blue-400 text-[10px] font-black uppercase tracking-widest">Enrolling...</p>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center p-12">
                  <Camera className="w-12 h-12 text-gray-800 mx-auto mb-4" />
                  <p className="text-gray-500 text-[10px] font-black uppercase tracking-[0.2em]">Sensor Ready</p>
                </div>
              )}
            </div>

            {/* Controls */}
            <div className="p-5 bg-gray-950/20 border-t border-gray-800/50 flex flex-col justify-center">
              {appState === AppState.READY ? (
                <div className="grid grid-cols-2 gap-4">
                  <button 
                    onClick={async () => {
                      setAppState(AppState.REGISTERING);
                      await startCamera();
                    }}
                    className="flex items-center justify-center gap-2 bg-gray-800 hover:bg-blue-600 text-white py-4 rounded-2xl font-black text-[11px] transition-all active:scale-[0.98] border border-gray-700 hover:border-blue-500 uppercase tracking-widest"
                  >
                    <UserCheck className="w-4 h-4" />
                    Enroll
                  </button>
                  <button 
                    disabled={profiles.length === 0}
                    onClick={initiateAttendance}
                    className="flex items-center justify-center gap-2 bg-gray-800 hover:bg-emerald-600 text-white py-4 rounded-2xl font-black text-[11px] transition-all active:scale-[0.98] border border-gray-700 hover:border-emerald-500 disabled:opacity-20 uppercase tracking-widest"
                  >
                    <Clock className="w-4 h-4" />
                    Attendance
                  </button>
                </div>
              ) : appState === AppState.REGISTERING ? (
                <div className="space-y-4">
                  <div className="flex gap-2">
                    <input 
                      type="text"
                      placeholder="Staff Name"
                      value={enrollName}
                      onChange={(e) => setEnrollName(e.target.value)}
                      className="flex-1 bg-gray-800 border-2 border-gray-700 rounded-xl px-5 py-3 text-xs font-bold text-white focus:outline-none focus:border-blue-500"
                    />
                    <button 
                      onClick={handleRegister}
                      disabled={isProcessing || !enrollName.trim()}
                      className="bg-white text-black px-8 py-3 rounded-xl font-black text-xs uppercase hover:bg-blue-600 hover:text-white transition-all disabled:opacity-30"
                    >
                      Capture
                    </button>
                  </div>
                  <button onClick={() => { stopCamera(); setAppState(AppState.READY); }} className="w-full text-gray-500 hover:text-white text-[10px] font-black uppercase underline decoration-gray-700">Cancel Enrollment</button>
                </div>
              ) : (
                <div className="text-center">
                  <button 
                    onClick={() => { stopCamera(); setAppState(AppState.READY); setCurrentResult(null); }}
                    className="px-6 py-2 bg-rose-600/10 hover:bg-rose-600 text-rose-500 hover:text-white border border-rose-500/20 rounded-xl text-[10px] font-black uppercase transition-all"
                  >
                    Exit Sensor
                  </button>
                </div>
              )}

              {/* Status Message Display */}
              {currentResult && (
                <div className={`mt-4 p-4 rounded-2xl border-2 animate-in slide-in-from-bottom-2 duration-300 ${
                  currentResult.clockInStatus === 'success' 
                  ? 'bg-emerald-500/10 border-emerald-500/30' 
                  : 'bg-amber-500/10 border-amber-500/30'
                }`}>
                  <div className="flex items-center gap-4">
                    <div className={`p-2 rounded-xl ${currentResult.clockInStatus === 'success' ? 'bg-emerald-500/20' : 'bg-amber-500/20'}`}>
                      {currentResult.clockInStatus === 'success' ? <CheckCircle2 className="w-6 h-6 text-emerald-500" /> : <ShieldCheck className="w-6 h-6 text-amber-500" />}
                    </div>
                    <div>
                      <h3 className={`text-sm font-black uppercase tracking-tight ${currentResult.clockInStatus === 'success' ? 'text-emerald-400' : 'text-amber-400'}`}>
                        {currentResult.label}
                      </h3>
                      <p className="text-[10px] font-bold text-gray-400 mt-0.5 uppercase tracking-wider">
                        {currentResult.clockInStatus === 'success' 
                          ? `Clock-in successful at ${currentResult.time}` 
                          : 'Already clocked in for today'}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar: Registry */}
        <div className="lg:col-span-4 flex flex-col">
          <div className="bg-gray-900 border border-gray-800 rounded-[2rem] overflow-hidden flex flex-col h-full shadow-lg">
            <div className="p-5 border-b border-gray-800/50 bg-gray-950/40 flex justify-between items-center">
              <div>
                <h2 className="text-[11px] font-black text-gray-400 uppercase tracking-widest">Registry</h2>
              </div>
              <div className="flex items-center gap-2">
                {profiles.length > 0 && (
                  <button 
                    onClick={clearRegistry}
                    title="Clear All Staff"
                    className="p-1.5 text-gray-600 hover:text-rose-500 transition-colors"
                  >
                    <UserMinus className="w-3 h-3" />
                  </button>
                )}
                <span className="bg-blue-600 text-white text-[9px] px-2 py-0.5 rounded-lg font-black">{profiles.length}</span>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto max-h-[420px] p-3 space-y-2 custom-scrollbar">
              {profiles.length === 0 ? (
                <div className="text-center py-16 opacity-30">
                  <UserCheck className="w-8 h-8 text-gray-700 mx-auto mb-2" />
                  <p className="text-[9px] font-black uppercase">Directory Empty</p>
                </div>
              ) : (
                profiles.map((profile) => (
                  <div key={profile.id} className="group flex items-center gap-3 bg-gray-800/20 p-3 rounded-xl border border-transparent hover:border-blue-600/30 transition-all">
                    <div className="w-8 h-8 bg-blue-600/10 border border-blue-500/10 rounded-lg flex items-center justify-center shrink-0">
                      <span className="text-blue-400 font-black text-xs">{profile.name.charAt(0).toUpperCase()}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-bold text-gray-200 text-[11px] truncate uppercase">{profile.name}</h4>
                      {profile.lastClockIn && (
                        <p className="text-[8px] text-emerald-500/60 font-black uppercase mt-0.5">Active Today</p>
                      )}
                    </div>
                    <button 
                      onClick={() => deleteProfile(profile.id)} 
                      className="p-1.5 text-gray-700 hover:text-rose-500 transition-all hover:bg-rose-500/10 rounded-lg"
                      title="Delete Biometric"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))
              )}
            </div>
            
            <div className="p-4 bg-gray-950/50 border-t border-gray-800/50">
               <div className="flex items-center gap-3 text-[9px] text-gray-600 font-bold uppercase tracking-tighter">
                 <Info className="w-3 h-3 text-blue-500" />
                 <span>Local biometric vault</span>
               </div>
            </div>
          </div>
        </div>
      </div>

      {/* Attendance Log Table Section */}
      <section className="bg-gray-900 border border-gray-800 rounded-[2rem] overflow-hidden shadow-2xl">
        <div className="p-6 border-b border-gray-800/50 bg-gray-950/40 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <History className="w-5 h-5 text-blue-500" />
            <h2 className="text-sm font-black text-white uppercase tracking-widest">Recent Attendance Logs</h2>
          </div>
          {attendanceLogs.length > 0 && (
            <button 
              onClick={clearLogs}
              className="text-[10px] font-black text-gray-500 hover:text-rose-500 uppercase tracking-widest transition-colors flex items-center gap-2"
            >
              <Trash2 className="w-3 h-3" />
              Clear History
            </button>
          )}
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-950/50">
                <th className="p-5 text-[10px] font-black text-gray-500 uppercase tracking-widest border-b border-gray-800/50">Staff Member</th>
                <th className="p-5 text-[10px] font-black text-gray-500 uppercase tracking-widest border-b border-gray-800/50">Clock-in Date</th>
                <th className="p-5 text-[10px] font-black text-gray-500 uppercase tracking-widest border-b border-gray-800/50">Time Recorded</th>
                <th className="p-5 text-[10px] font-black text-gray-500 uppercase tracking-widest border-b border-gray-800/50">Auth Status</th>
                <th className="p-5 text-[10px] font-black text-gray-500 uppercase tracking-widest border-b border-gray-800/50 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {attendanceLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-16 text-center">
                    <div className="opacity-20 flex flex-col items-center">
                      <ListFilter className="w-10 h-10 mb-3" />
                      <p className="text-[10px] font-black uppercase tracking-[0.2em]">No records found for the current period</p>
                    </div>
                  </td>
                </tr>
              ) : (
                attendanceLogs.map((log) => (
                  <tr key={log.id} className="group hover:bg-gray-800/30 transition-colors">
                    <td className="p-5 border-b border-gray-800/50">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-blue-600/10 rounded-lg flex items-center justify-center text-[10px] font-black text-blue-400">
                          {log.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-xs font-bold text-gray-200 uppercase">{log.name}</span>
                      </div>
                    </td>
                    <td className="p-5 border-b border-gray-800/50">
                      <span className="text-xs font-medium text-gray-400">{log.date}</span>
                    </td>
                    <td className="p-5 border-b border-gray-800/50">
                      <div className="flex items-center gap-2">
                        <Clock className="w-3 h-3 text-gray-600" />
                        <span className="text-xs font-black text-gray-300">{log.time}</span>
                      </div>
                    </td>
                    <td className="p-5 border-b border-gray-800/50">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-[9px] font-black text-emerald-500 uppercase tracking-wider">
                        <CheckCircle2 className="w-2.5 h-2.5" />
                        Verified
                      </span>
                    </td>
                    <td className="p-5 border-b border-gray-800/50 text-right">
                      <button 
                        onClick={() => deleteLogEntry(log.id)}
                        className="p-2 text-gray-700 hover:text-rose-500 hover:bg-rose-500/10 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                        title="Delete Record"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        {attendanceLogs.length > 0 && (
          <div className="p-4 bg-gray-950/20 text-center">
             <p className="text-[9px] text-gray-600 font-bold uppercase tracking-widest">Showing last {attendanceLogs.length} verified scans</p>
          </div>
        )}
      </section>
      
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 3px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #1f2937; border-radius: 10px; }
      `}</style>
    </div>
  );
};

export default App;
